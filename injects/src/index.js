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

  Edits go live at once (decided with the owner); every save is numbered, records who made it, and can be restored.
  Who may edit: build 12 had a secret in the address, build 13 had nothing (open to anyone who found /edit), build 15
  (this one) lets in anyone who can receive an email at an allowed domain (ALLOWED_DOMAINS, readyfortuesday.com and
  decaro.net) through an emailed one-time link (auth.js). Opening the link is a button on the editor page, not the
  link itself, because mail scanners open links to check them and would otherwise use up the one-time token.
  A save from another website's page is also refused (the Origin check), as before.
  First read seeds the store from seed.json, a copy of the deck that was built into index.html at build 12.
*/
import { DurableObject } from "cloudflare:workers";
import { validateDeck } from "./validate.js";
import SEED from "../seed.json";
import { TOKEN_TTL_S, SESSION_TTL_S, MAX_PER_EMAIL_PER_HOUR, MAX_PER_HOUR, randomToken, sha256, allowedEmail, cookieOf, SESSION_COOKIE, sessionCookie, sendMail } from "./auth.js";

const MAX_VERSIONS = 500;         // ~60 KB each, so 30 MB at most; older ones are dropped past this
const MAX_SUMMARY = 200;
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

    const m = p.match(/^\/api\/edit\/(history|version\/(\d+)|save|restore)$/);
    if (m) {
      const who = await stub.whoIs(await sha256(cookieOf(request, SESSION_COOKIE)));
      if (!who) return json({ error: "Your sign-in has ended or you haven't signed in. Sign in again; your changes on the page are kept." }, 401);
      if (m[1] === "history") return json(await stub.history());
      if (m[2]) { const v = await stub.version(Number(m[2])); return v ? json(v) : json({ error: "no such version" }, 404); }
      if (request.method !== "POST") return json({ error: "use POST" }, 405);
      if (!posting()) return json({ error: "Editing is only possible from the editor page." }, 403);
      const r = await readBody(); if (r.err) return r.err;
      if (m[1] === "save") return stub.save(r.body, who).then((x) => json(x.body, x.status));
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
  restore(b, by) {
    const old = b && this.version(Number(b.version));
    if (!old) return { status: 404, body: { error: "There is no such version to restore." } };
    const errors = validateDeck(old);
    if (errors.length) return { status: 422, body: { error: "That version no longer passes the checks: " + errors[0] } };
    return { status: 200, body: { version: this._write(old, "Restored version " + old.version, by) } };
  }
}
