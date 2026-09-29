/*
  Ballotship relay — a mailbox, one per room. It carries strings and decides
  nothing; every game rule runs in the browser. See ../ballotship-SUMMARY.md.

    POST /room/<room>/send   {from, code, note, note2}   -> {ok, seq}
    GET  /room/<room>/poll?since=<seq>&as=<t1|t2|mod>    -> {messages:[{seq, from, code, note, note2}]}

  Poll leaves out the asking screen's own messages; the moderator gets all of
  them. Each room is one Durable Object with its own SQLite table, so messages
  are numbered in the order they arrive.

  Cost notes: plain HTTP only (no held-open connections), so an idle room
  costs nothing between requests. A per-room request limit stops a runaway
  tab or a bug from running up usage. Rooms are NOT auto-deleted (see
  ROADMAP.md, Ideas).
*/
import { DurableObject } from "cloudflare:workers";

const ROOM_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;   // same rule the page enforces
const SIDES = ["t1", "t2", "mod"];
const MAX_BODY = 1.5 * 1024 * 1024;            // a chat note can carry a few ~140 KB attachments
const MAX_FIELD = 1.4 * 1024 * 1024;
const MAX_MESSAGES = 5000;                     // per room; a long exercise sends a few hundred
const MAX_BATCH = 50;                          // messages returned per poll
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 400;                        // requests per room per minute; 3 fast-polling screens use ~120

const CORS = {
  // "*" on purpose: in turn-taking mode each team may open its own saved copy
  // of the page (file://), so the origin can't be pinned. The room name is the secret.
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return json({ ok: true, service: "ballotship-relay" });
    }
    const m = url.pathname.match(/^\/room\/([^/]+)\/(send|poll)$/);
    if (!m) return json({ error: "not found" }, 404);
    const room = decodeURIComponent(m[1]);
    if (!ROOM_RE.test(room)) return json({ error: "bad room name" }, 400);
    const action = m[2];
    if (action === "send" && request.method !== "POST") return json({ error: "use POST" }, 405);
    if (action === "poll" && request.method !== "GET") return json({ error: "use GET" }, 405);
    const len = Number(request.headers.get("content-length") || 0);
    if (len > MAX_BODY) return json({ error: "message too large" }, 413);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    return stub.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      side TEXT NOT NULL, code TEXT NOT NULL, note TEXT NOT NULL, note2 TEXT NOT NULL,
      at INTEGER NOT NULL)`);
    this.hits = [];   // request timestamps for the rate limit; in memory is enough
  }

  limited() {
    const now = Date.now();
    while (this.hits.length && now - this.hits[0] > RATE_WINDOW_MS) this.hits.shift();
    this.hits.push(now);
    return this.hits.length > RATE_LIMIT;
  }

  async fetch(request) {
    if (this.limited()) return json({ error: "relay busy, slow down" }, 429);
    const url = new URL(request.url);
    return url.pathname.endsWith("/send") ? this.send(request) : this.poll(url);
  }

  async send(request) {
    let text;
    try { text = await request.text(); } catch (e) { return json({ error: "could not read body" }, 400); }
    if (text.length > MAX_BODY) return json({ error: "message too large" }, 413);
    let b;
    try { b = JSON.parse(text); } catch (e) { return json({ error: "body must be JSON" }, 400); }
    const side = String(b.from || "");
    const code = String(b.code || "");
    // The moderator only watches, except that it may end the exercise early or
    // resume it (build 6), which both team screens need to hear about.
    const modControl = /-(END|RESUME)$/.test(code);
    if (!SIDES.includes(side) || (side === "mod" && !modControl)) return json({ error: "from must be t1 or t2" }, 400);
    const note = String(b.note || "");
    const note2 = String(b.note2 || "");
    if (!code || code.length > 200) return json({ error: "missing or oversized code" }, 400);
    if (note.length > MAX_FIELD || note2.length > MAX_FIELD) return json({ error: "message too large" }, 413);
    const count = this.sql.exec("SELECT COUNT(*) AS n FROM msgs").one().n;
    if (count >= MAX_MESSAGES) return json({ error: "room is full; start a new room" }, 409);
    const seq = this.sql.exec(
      "INSERT INTO msgs (side, code, note, note2, at) VALUES (?, ?, ?, ?, ?) RETURNING seq",
      side, code, note, note2, Date.now()
    ).one().seq;
    return json({ ok: true, seq });
  }

  poll(url) {
    const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
    const as = url.searchParams.get("as") || "";
    if (!SIDES.includes(as)) return json({ error: "as must be t1, t2 or mod" }, 400);
    const rows = as === "mod"
      ? this.sql.exec("SELECT seq, side, code, note, note2 FROM msgs WHERE seq > ? ORDER BY seq LIMIT ?", since, MAX_BATCH).toArray()
      : this.sql.exec("SELECT seq, side, code, note, note2 FROM msgs WHERE seq > ? AND side != ? ORDER BY seq LIMIT ?", since, as, MAX_BATCH).toArray();
    return json({
      messages: rows.map(r => ({ seq: r.seq, from: r.side, code: r.code, note: r.note, note2: r.note2 })),
    });
  }
}
