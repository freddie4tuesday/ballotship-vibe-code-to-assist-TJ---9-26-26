/*
  Ballotship inject library (build 12). One deck of injects, kept in one Durable Object (SQLite), so an
  edit is one write and every reader sees a whole deck or the previous one, never half of a save.

    GET  /api/deck                 the current deck: {version, start, injects}. Public, read by the game.
    GET  /edit/<token>             the editor page (only with the secret in the address)
    GET  /api/edit/<token>/history [{version, at, summary}] newest first
    GET  /api/edit/<token>/version/<n>   one old deck, for the "what changed" view
    POST /api/edit/<token>/save    {base, start, injects, summary}  -> {version} or 409 if base is stale
    POST /api/edit/<token>/restore {version}                        -> {version} (a restore is itself a new version)

  Edits go live at once (decided with the owner); every save is numbered and can be restored, which is
  the safety net. The token is a secret in the address, not a login; see ROADMAP.md (who may edit).
  If the token isn't set, editing is off and the deck is read-only. First read seeds the store from
  seed.json, a copy of the deck that was built into index.html at build 12.
*/
import { DurableObject } from "cloudflare:workers";
import { validateDeck } from "./validate.js";
import SEED from "../seed.json";

const MAX_VERSIONS = 500;         // ~60 KB each, so 30 MB at most; older ones are dropped past this
const MAX_SUMMARY = 200;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS, ...extra } });

// Constant-time comparison so a wrong guess doesn't reveal how much of the token was right.
function same(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname;
    const stub = env.DECK.get(env.DECK.idFromName("deck"));

    if (p === "/api/deck") return request.method === "GET" ? stub.getDeck().then((d) => json(d)) : json({ error: "use GET" }, 405);

    let m = p.match(/^\/edit\/([^/]+)\/?$/);
    if (m) {
      if (!env.EDIT_TOKEN || !same(m[1], env.EDIT_TOKEN)) return new Response("Not found", { status: 404 });
      const page = await env.ASSETS.fetch(new Request(new URL("/editor.html", url), request));
      const h = new Headers(page.headers);
      h.set("cache-control", "no-store"); h.set("referrer-policy", "no-referrer"); h.set("x-robots-tag", "noindex");
      return new Response(page.body, { status: page.status, headers: h });
    }

    m = p.match(/^\/api\/edit\/([^/]+)\/(history|version\/(\d+)|save|restore)$/);
    if (m) {
      if (!env.EDIT_TOKEN || !same(m[1], env.EDIT_TOKEN)) return json({ error: "not found" }, 404);
      if (m[2] === "history") return json(await stub.history());
      if (m[3]) { const v = await stub.version(Number(m[3])); return v ? json(v) : json({ error: "no such version" }, 404); }
      if (request.method !== "POST") return json({ error: "use POST" }, 405);
      if (Number(request.headers.get("content-length") || 0) > 500000) return json({ error: "too large" }, 413);
      let body; try { body = await request.json(); } catch (e) { return json({ error: "That wasn't readable. Reload the page and try again." }, 400); }
      if (m[2] === "save") return stub.save(body).then((r) => json(r.body, r.status));
      return stub.restore(body).then((r) => json(r.body, r.status));
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
    if (this.sql.exec("SELECT COUNT(*) AS n FROM versions").one().n === 0) {
      const seed = { start: SEED.start, injects: SEED.injects };
      this.sql.exec("INSERT INTO versions (version, at, summary, deck) VALUES (1, ?, ?, ?)", Date.now(), "Starting deck (the 16 injects that were built into the game)", JSON.stringify(seed));
    }
  }
  _latest() { const r = this.sql.exec("SELECT version, at, summary, deck FROM versions ORDER BY version DESC LIMIT 1").one(); return { version: r.version, at: r.at, summary: r.summary, ...JSON.parse(r.deck) }; }
  getDeck() { return this._latest(); }
  history() { return [...this.sql.exec("SELECT version, at, summary FROM versions ORDER BY version DESC")].map((r) => ({ version: r.version, at: r.at, summary: r.summary })); }
  version(n) { const r = [...this.sql.exec("SELECT version, at, summary, deck FROM versions WHERE version = ?", n)][0]; return r ? { version: r.version, at: r.at, summary: r.summary, ...JSON.parse(r.deck) } : null; }
  _write(deck, summary) {
    const next = this._latest().version + 1;
    this.sql.exec("INSERT INTO versions (version, at, summary, deck) VALUES (?, ?, ?, ?)", next, Date.now(), summary, JSON.stringify({ start: deck.start, injects: deck.injects }));
    this.sql.exec("DELETE FROM versions WHERE version <= ?", next - MAX_VERSIONS);
    return next;
  }
  save(b) {
    if (!b || typeof b !== "object") return { status: 400, body: { error: "Nothing to save." } };
    const cur = this._latest();
    if (b.base !== cur.version) return { status: 409, body: { error: "Someone else saved while you were editing (now version " + cur.version + "). Reload the page to see their changes, then make yours again.", version: cur.version } };
    const errors = validateDeck(b);
    if (errors.length) return { status: 422, body: { error: "Not saved. " + errors[0], errors } };
    const summary = String(b.summary || "Edited").replace(/[\u0000-\u001f]/g, " ").slice(0, MAX_SUMMARY) || "Edited";
    return { status: 200, body: { version: this._write(b, summary) } };
  }
  restore(b) {
    const old = b && this.version(Number(b.version));
    if (!old) return { status: 404, body: { error: "There is no such version to restore." } };
    const errors = validateDeck(old);
    if (errors.length) return { status: 422, body: { error: "That version no longer passes the checks: " + errors[0] } };
    return { status: 200, body: { version: this._write(old, "Restored version " + old.version) } };
  }
}
