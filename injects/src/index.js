/*
  Ballotship inject library. One deck of injects, kept in one Durable Object (SQLite), so an
  edit is one write and every reader sees a whole deck or the previous one, never half of a save.

    GET  /api/deck                 the current deck: {version, injects} (the order is the play order; the first inject starts the game). Public, read by the game.
    GET  /edit                     the editor page (public; it shows a sign-in box until you are signed in)
    POST /api/auth/request         {email}  -> always {ok:true}; emails a sign-in link if the address is on an allowed domain
    POST /api/auth/verify          {token}  -> signs this browser in for 1 day (sets a cookie); the link is single-use
    GET  /api/auth/me              {email} when signed in, else 401
    POST /api/auth/logout
    GET  /api/edit/history         [{version, at, summary, by}] newest first             (signed in)
    GET  /api/edit/version/<n>     one old deck, for the "what changed" view              (signed in)
    POST /api/edit/save            {base, injects, summary}  -> {version} or 409 if base is stale   (signed in)
    POST /api/edit/restore         {version}  -> {version} (a restore is itself a new version)      (signed in)
    POST /api/edit/backup          {takenAt}  -> {backup, last}: the whole library as one file, and the shared
                                   "Last backup" stamp, recorded as this request is answered          (signed in, build 24)
    GET  /api/edit/backup-status   {at, by}: the shared "Last backup" stamp (at is ISO UTC, or null)   (signed in, build 24)
    POST /api/edit/restore-file    {backup, check:true} -> what the file holds, or what is wrong with it (changes nothing);
                                   {backup, base} -> {version}, or 409 if base is stale, as for a save  (signed in, build 24)

  Edits go live at once (decided with the owner); every save is numbered, records who made it, and can be restored.
  Who may edit: build 12 had a secret in the address, build 13 had nothing (open to anyone who found /edit), build 15
  (this one) lets in anyone who can receive an email at an allowed domain (ALLOWED_DOMAINS, readyfortuesday.com and
  decaro.net) through an emailed one-time link (auth.js). Opening the link is a button on the editor page, not the
  link itself, because mail scanners open links to check them and would otherwise use up the one-time token.
  A save from another website's page is also refused (the Origin check), as before.
  First read seeds the store from seed.json, a copy of the deck that was built into index.html at build 12.
*/
import { DurableObject } from "cloudflare:workers";
import { validateDeck, readBackup, BACKUP_APP, BACKUP_SCHEMA, APP_BUILD } from "./validate.js";
import SEED from "../seed.json";
import { TOKEN_TTL_S, SESSION_TTL_S, MAX_PER_EMAIL_PER_HOUR, MAX_PER_HOUR, randomToken, sha256, allowedEmail, cookieOf, SESSION_COOKIE, sessionCookie, sendMail } from "./auth.js";

const MAX_VERSIONS = 500;         // ~60 KB each, so 30 MB at most; older ones are dropped past this
const MAX_SUMMARY = 200;
// How far back a backup's "taken at" (the moment the editor's Backup button was pressed) may be from the server's clock.
// Outside this, the server's own time is used: a stamp can never be in the future, and can't be backdated by more than
// this to look older than it is.
const STAMP_SKEW_MS = 5 * 60 * 1000;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra } });


const OK_BODY = { ok: true, message: "If that address can be used here, a sign-in link is on its way. It works once and expires in 15 minutes." };

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname;
    const stub = env.DECK.get(env.DECK.idFromName("deck"));
    const ttl = (name, dflt) => Number(env[name]) > 0 ? Number(env[name]) : dflt;   // tests shorten these; live uses the defaults

    if (p === "/api/deck") return request.method === "GET" ? stub.getDeck().then((d) => json(d)) : json({ error: "use GET" }, 405);

    if (p === "/edit" || p === "/edit/") {
      const page = await env.ASSETS.fetch(new Request(new URL("/editor.html", url), request));
      const h = new Headers(page.headers);
      h.set("cache-control", "no-store"); h.set("x-robots-tag", "noindex"); h.set("referrer-policy", "no-referrer");
      return new Response(page.body, { status: page.status, headers: h });
    }

    const posting = () => {
      // A script on some other website could otherwise act through a signed-in visitor's browser (the CORS header above
      // lets any site READ the deck, which the game needs). A browser always sends Origin on a POST; refuse one that
      // isn't this site. Anything not from a browser sends none, so this is a second layer beside SameSite=Strict.
      const origin = request.headers.get("origin");
      return !(origin && origin !== url.origin);
    };
    const readBody = async () => {
      if (Number(request.headers.get("content-length") || 0) > 500000) return { err: json({ error: "too large" }, 413) };
      try { return { body: await request.json() }; } catch (e) { return { err: json({ error: "That wasn't readable. Reload the page and try again." }, 400) }; }
    };

    if (p.startsWith("/api/auth/")) {
      const what = p.slice("/api/auth/".length);
      if (what === "me") {
        const who = await stub.whoIs(await sha256(cookieOf(request, SESSION_COOKIE)));
        return who ? json({ email: who }) : json({ error: "Not signed in." }, 401);
      }
      if (request.method !== "POST") return json({ error: "use POST" }, 405);
      if (!posting()) return json({ error: "Sign-in is only possible from the editor page." }, 403);
      if (what === "logout") {
        await stub.endSession(await sha256(cookieOf(request, SESSION_COOKIE)));
        return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
      }
      const r = await readBody(); if (r.err) return r.err;
      if (what === "request") {
        // The same answer every time, whether or not the address is allowed or a mail went out, so this can't be used to
        // find out who is allowed. The work happens after the answer is sent.
        const email = allowedEmail(r.body && r.body.email, env.ALLOWED_DOMAINS);
        if (email) ctx.waitUntil((async () => {
          const token = randomToken();
          const ok = await stub.newToken(await sha256(token), email, ttl("TOKEN_TTL_SECONDS", TOKEN_TTL_S), MAX_PER_EMAIL_PER_HOUR, MAX_PER_HOUR);
          if (ok) await sendMail(env, email, url.origin + "/edit?t=" + token);
        })());
        return json(OK_BODY);
      }
      if (what === "verify") {
        const token = r.body && typeof r.body.token === "string" ? r.body.token : "";
        const sid = randomToken();
        const email = token.length >= 20 && token.length <= 100 ? await stub.useToken(await sha256(token), await sha256(sid), ttl("SESSION_TTL_SECONDS", SESSION_TTL_S)) : null;
        if (!email) return json({ error: "That link has expired or was already used. Ask for a new one." }, 401);
        return json({ ok: true, email }, 200, { "set-cookie": sessionCookie(sid, ttl("SESSION_TTL_SECONDS", SESSION_TTL_S)) });
      }
      return json({ error: "not found" }, 404);
    }

    const m = p.match(/^\/api\/edit\/(history|version\/(\d+)|save|restore|backup|backup-status|restore-file)$/);
    if (m) {
      const who = await stub.whoIs(await sha256(cookieOf(request, SESSION_COOKIE)));
      if (!who) return json({ error: "Your sign-in has ended or you haven't signed in. Sign in again; your changes on the page are kept." }, 401);
      if (m[1] === "history") return json(await stub.history());
      if (m[2]) { const v = await stub.version(Number(m[2])); return v ? json(v) : json({ error: "no such version" }, 404); }
      if (m[1] === "backup-status") return json(await stub.backupStamp());
      if (request.method !== "POST") return json({ error: "use POST" }, 405);
      if (!posting()) return json({ error: "Editing is only possible from the editor page." }, 403);
      const r = await readBody(); if (r.err) return r.err;
      if (m[1] === "save") return stub.save(r.body, who).then((x) => json(x.body, x.status));
      if (m[1] === "backup") return json(await stub.backup(r.body && r.body.takenAt, who));
      if (m[1] === "restore-file") return stub.restoreFile(r.body, who).then((x) => json(x.body, x.status));
      return stub.restore(r.body, who).then((x) => json(x.body, x.status));
    }
    if (p === "/" || p === "") return json({ ok: true, service: "ballotship-injects" });
    return env.ASSETS.fetch(request);
  },
};

export class Deck extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS versions (version INTEGER PRIMARY KEY, at INTEGER NOT NULL, summary TEXT NOT NULL, deck TEXT NOT NULL)");
    // Build 15: who made each version (null for the starting deck and for versions saved before sign-in existed).
    if (![...this.sql.exec("PRAGMA table_info(versions)")].some((c) => c.name === "edited_by")) this.sql.exec("ALTER TABLE versions ADD COLUMN edited_by TEXT");
    this.sql.exec("CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, made INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)");
    // Build 24: the shared "Last backup" stamp, one row. Shared by everyone who edits (not per browser), so the banner
    // tells the whole team, not just whoever pressed the button.
    this.sql.exec("CREATE TABLE IF NOT EXISTS backup_stamp (id INTEGER PRIMARY KEY CHECK (id = 1), at INTEGER NOT NULL, by_email TEXT)");
    if (this.sql.exec("SELECT COUNT(*) AS n FROM versions").one().n === 0) {
      const seed = { injects: SEED.injects };
      this.sql.exec("INSERT INTO versions (version, at, summary, deck) VALUES (1, ?, ?, ?)", Date.now(), "Starting deck (the 16 injects that were built into the game)", JSON.stringify(seed));
    }
  }
  // Build 14: a deck no longer has a starting inject (the first one starts). Versions saved before that still carry
  // one in their stored JSON; it is dropped when read so it can't reach the game or the editor.
  _open(r) { const d = JSON.parse(r.deck); return { version: r.version, at: r.at, summary: r.summary, injects: d.injects }; }
  _latest() { return this._open(this.sql.exec("SELECT version, at, summary, deck FROM versions ORDER BY version DESC LIMIT 1").one()); }
  getDeck() { return this._latest(); }
  history() { return [...this.sql.exec("SELECT version, at, summary, edited_by FROM versions ORDER BY version DESC")].map((r) => ({ version: r.version, at: r.at, summary: r.summary, by: r.edited_by || null })); }
  _sweep() { const now = Date.now(); this.sql.exec("DELETE FROM tokens WHERE expires < ? AND made < ?", now, now - 3600 * 1000); this.sql.exec("DELETE FROM sessions WHERE expires < ?", now); }
  /* Make a one-time link token for this address, unless too many were made in the last hour (returns false then). */
  newToken(hash, email, ttlS, perEmail, perHour) {
    this._sweep(); const now = Date.now(), hourAgo = now - 3600 * 1000;
    if (this.sql.exec("SELECT COUNT(*) AS n FROM tokens WHERE email = ? AND made > ?", email, hourAgo).one().n >= perEmail) return false;
    if (this.sql.exec("SELECT COUNT(*) AS n FROM tokens WHERE made > ?", hourAgo).one().n >= perHour) return false;
    this.sql.exec("INSERT INTO tokens (hash, email, made, expires) VALUES (?, ?, ?, ?)", hash, email, now, now + ttlS * 1000);
    return true;
  }
  /* Spend a token: once, and before it expires. Returns the address, or null. Starts a session for it. */
  useToken(hash, sessionHash, sessionTtlS) {
    const now = Date.now(), r = [...this.sql.exec("SELECT email, expires, used FROM tokens WHERE hash = ?", hash)][0];
    if (!r || r.used || r.expires < now) return null;
    this.sql.exec("UPDATE tokens SET used = 1 WHERE hash = ?", hash);
    this.sql.exec("INSERT INTO sessions (hash, email, expires) VALUES (?, ?, ?)", sessionHash, r.email, now + sessionTtlS * 1000);
    return r.email;
  }
  whoIs(hash) { const r = [...this.sql.exec("SELECT email, expires FROM sessions WHERE hash = ?", hash)][0]; return r && r.expires > Date.now() ? r.email : null; }
  endSession(hash) { this.sql.exec("DELETE FROM sessions WHERE hash = ?", hash); }
  version(n) { const r = [...this.sql.exec("SELECT version, at, summary, deck FROM versions WHERE version = ?", n)][0]; return r ? this._open(r) : null; }
  _write(deck, summary, by) {
    const next = this._latest().version + 1;
    this.sql.exec("INSERT INTO versions (version, at, summary, deck, edited_by) VALUES (?, ?, ?, ?, ?)", next, Date.now(), summary, JSON.stringify({ injects: deck.injects }), by || null);
    this.sql.exec("DELETE FROM versions WHERE version <= ?", next - MAX_VERSIONS);
    return next;
  }
  save(b, by) {
    if (!b || typeof b !== "object") return { status: 400, body: { error: "Nothing to save." } };
    const cur = this._latest();
    if (b.base !== cur.version) return { status: 409, body: { error: "Someone else saved while you were editing (now version " + cur.version + "). Reload the page to see their changes, then make yours again.", version: cur.version } };
    const errors = validateDeck(b);
    if (errors.length) return { status: 422, body: { error: "Not saved. " + errors[0], errors } };
    const summary = String(b.summary || "Edited").replace(/[\u0000-\u001f]/g, " ").slice(0, MAX_SUMMARY) || "Edited";
    return { status: 200, body: { version: this._write(b, summary, by) } };
  }
  backupStamp() {
    const r = [...this.sql.exec("SELECT at, by_email FROM backup_stamp WHERE id = 1")][0];
    return r ? { at: new Date(r.at).toISOString(), by: r.by_email || null } : { at: null, by: null };
  }
  /* Build 24. The whole library as one file. Only the deck goes in: never the sign-in tables (link tokens, sessions;
     they are stored only as hashes anyway) and nothing from the Worker's settings (the Resend key), so a file that is
     lost or mailed around can't be used to sign in. History is not in the file either: 500 versions would be up to
     30 MB, and a restore adds a version rather than replacing History, so History is never what a file brings back.
     The stamp follows the poll worker app's rule: a newer stamp always wins, so a slow request from a backup taken
     earlier (two editors pressing Backup a moment apart) can't make the stamp go backwards. */
  backup(takenAt, by) {
    const now = Date.now(), t = Number(takenAt);
    const at = Number.isFinite(t) && t <= now && t >= now - STAMP_SKEW_MS ? Math.floor(t) : now;
    this.sql.exec("INSERT INTO backup_stamp (id, at, by_email) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, by_email = excluded.by_email WHERE excluded.at > backup_stamp.at", at, by || null);
    const cur = this._latest();
    return {
      backup: { app: BACKUP_APP, schemaVersion: BACKUP_SCHEMA, appVersion: "build " + APP_BUILD, savedAt: new Date(at).toISOString(), savedBy: by || null,
        deckVersion: cur.version, deckSavedAt: new Date(cur.at).toISOString(), deckSummary: cur.summary, injects: cur.injects },
      last: this.backupStamp(),
    };
  }
  /* Build 24. Put a backup file back. The file is read and checked in full first (readBackup: right tool, a format this
     build reads, every inject passing the same checks as a save); with check:true that is all that happens, so the
     editor can show what the file holds before anyone confirms. The restore itself is a save like any other: it needs
     the version the editor last loaded (a 409 if someone saved since), and it becomes a new version, so the deck it
     replaces stays in History and can be restored from there. */
  restoreFile(b, by) {
    if (!b || typeof b !== "object") return { status: 400, body: { error: "No backup file was sent. Choose one and try again." } };
    const f = readBackup(b.backup);
    if (f.errors.length) return { status: 422, body: { error: f.errors[0], errors: f.errors } };
    if (b.check) return { status: 200, body: { ok: true, info: f.info } };
    const cur = this._latest();
    if (b.base !== cur.version) return { status: 409, body: { error: "Someone else saved while you were working (now version " + cur.version + "). Nothing was restored. Reload the page, then restore the file again.", version: cur.version } };
    const taken = f.info.savedAt ? " taken " + f.info.savedAt.slice(0, 16).replace("T", " ") + " UTC" : "";
    const summary = ("Restored from a backup file" + taken + (f.info.savedBy ? " by " + f.info.savedBy : "")).slice(0, MAX_SUMMARY);
    return { status: 200, body: { version: this._write(f.deck, summary, by), info: f.info } };
  }
  restore(b, by) {
    const old = b && this.version(Number(b.version));
    if (!old) return { status: 404, body: { error: "There is no such version to restore." } };
    const errors = validateDeck(old);
    if (errors.length) return { status: 422, body: { error: "That version no longer passes the checks: " + errors[0] } };
    return { status: 200, body: { version: this._write(old, "Restored version " + old.version, by) } };
  }
}
