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
  tab or a bug from running up usage. A room is deleted a week after its
  last message (build 17).
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

/* Build 18 - a guest joining with a join code goes through /room/<code>/lookup, which reads the room like a moderator's
   poll does but also keeps count, per visitor (network address), of lookups that found no exercise. After 10 in an hour
   (WRONG_CODE_LIMIT, WRONG_CODE_WINDOW_SECONDS) every further lookup from that visitor is refused with 429 until the hour
   is up, so nobody can try codes one after another to find other people's exercises. HONEST LIMIT: this covers the join
   screen's lookups only. A room's messages can still be read by anyone who has its name (that is the relay's whole model:
   the room name is the secret), so a script that polls rooms directly is not counted; the length of the code (a word and
   three digits, about 250,000) is what protects against that. */
const WRONG_CODE_LIMIT_DEFAULT = 10;
const WRONG_CODE_WINDOW_DEFAULT_S = 60 * 60;

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "") {
      return json({ ok: true, service: "ballotship-relay" });
    }
    const lk = url.pathname.match(/^\/room\/([^/]+)\/lookup$/);
    if (lk) {
      if (request.method !== "GET") return json({ error: "use GET" }, 405);
      const room = decodeURIComponent(lk[1]);
      if (!ROOM_RE.test(room)) return json({ error: "bad room name" }, 400);
      const ip = request.headers.get("cf-connecting-ip") || "unknown";
      const guard = env.GUARD.get(env.GUARD.idFromName("ip:" + ip));
      if (await guard.blocked()) return json({ error: "too many wrong codes", blocked: true }, 429);
      const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
      const poll = new Request(new URL("/room/" + encodeURIComponent(room) + "/poll?as=mod&since=" + since, url), { method: "GET" });
      const res = await env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(poll);
      if (res.status !== 200) return res;
      const body = await res.json();
      if (since === 0 && !(body.messages || []).some((m) => /-SETUP$/.test(String(m.code)))) await guard.miss();
      return json(body);
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

/* Build 17 - a room is deleted a week after its LAST message (decided with the owner). The exercise has teams make
   convincing fake material, and the game's rules say to delete it afterwards; before this, everything stayed on
   Cloudflare until someone removed it. Counting from the last message means a game under way never disappears, and a
   room that is only read (a stranger trying codes) never gets an alarm at all. Each message resets one Durable Object
   alarm, a single small write. ROOM_TTL_SECONDS shortens it for tests; the live relay uses the default. */
const ROOM_TTL_DEFAULT_S = 7 * 24 * 60 * 60;

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.init();
    this.hits = [];   // request timestamps for the rate limit; in memory is enough
  }

  init() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS msgs (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      side TEXT NOT NULL, code TEXT NOT NULL, note TEXT NOT NULL, note2 TEXT NOT NULL,
      at INTEGER NOT NULL)`);
  }

  ttlMs() { const n = Number(this.env.ROOM_TTL_SECONDS); return (n > 0 ? n : ROOM_TTL_DEFAULT_S) * 1000; }

  /* Runs one TTL after the last message: everything in the room goes. The table is made again at once, because this
     object stays in memory and the next request must find it there (a stale screen simply sees an empty room). */
  async alarm() {
    await this.ctx.storage.deleteAll();
    this.init();
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
    // resume it (build 6), or change the clock (build 11), which the team screens
    // need to hear about. Build 16: and it may post the exercise's settings when it sets an
    // exercise up (a join code), which the teams read.
    const modControl = /-(END|RESUME|CLK|SETUP)$/.test(code);
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
    await this.ctx.storage.setAlarm(Date.now() + this.ttlMs());   // build 17: a week from now, unless another message comes first
    return json({ ok: true, seq });
  }

  poll(url) {
    const since = Math.max(0, parseInt(url.searchParams.get("since") || "0", 10) || 0);
    const as = url.searchParams.get("as") || "";
    if (!SIDES.includes(as)) return json({ error: "as must be t1, t2 or mod" }, 400);
    const rows = as === "mod"
      ? this.sql.exec("SELECT seq, side, code, note, note2, at FROM msgs WHERE seq > ? ORDER BY seq LIMIT ?", since, MAX_BATCH).toArray()
      : this.sql.exec("SELECT seq, side, code, note, note2, at FROM msgs WHERE seq > ? AND side != ? ORDER BY seq LIMIT ?", since, as, MAX_BATCH).toArray();
    // `at` is when the relay stored each message and `now` is the relay's clock at this
    // reply, both in milliseconds (build 11). A clock change that reaches a screen late
    // (screens check every 15 s) is corrected by how long it was in transit, and both times
    // come from this one clock, so screens whose own clocks differ still agree.
    return json({
      messages: rows.map(r => ({ seq: r.seq, from: r.side, code: r.code, note: r.note, note2: r.note2, at: r.at })),
      now: Date.now(),
    });
  }
}

/* One per visitor: the times of that visitor's lookups that found no exercise, kept for the window and then deleted. */
export class Guard extends DurableObject {
  windowMs() { const n = Number(this.env.WRONG_CODE_WINDOW_SECONDS); return (n > 0 ? n : WRONG_CODE_WINDOW_DEFAULT_S) * 1000; }
  limit() { const n = Number(this.env.WRONG_CODE_LIMIT); return n > 0 ? n : WRONG_CODE_LIMIT_DEFAULT; }
  async recent() {
    const cutoff = Date.now() - this.windowMs();
    return ((await this.ctx.storage.get("misses")) || []).filter((t) => t > cutoff);
  }
  async blocked() { return (await this.recent()).length >= this.limit(); }
  async miss() {
    const list = await this.recent(); list.push(Date.now());
    await this.ctx.storage.put("misses", list);
    await this.ctx.storage.setAlarm(Date.now() + this.windowMs() + 1000);   // tidy up once the window has passed
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}
