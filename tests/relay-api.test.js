/*
  Relay rules, checked directly against a local copy of ../worker (no browser):
  message order, own-message filtering, moderator sees all, input checks,
  browser permission (CORS), size cap, and the per-room request limit. And (build 17) that a room is deleted a set time
  after its LAST message: tested with a 3-second lifetime on a relay of its own, where the live one uses a week.
*/
const { reporter, withRelay } = require("./helpers");

(async () => {
  const r = reporter("Relay API (local copy of worker/)");
  try {
    await withRelay(async relay => {
      const room = relay + "/room/api-" + Date.now();
      const send = (body) => fetch(room + "/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const poll = async (as, since) => (await fetch(room + "/poll?as=" + as + "&since=" + (since || 0))).json();

      r.check("health check answers", (await (await fetch(relay + "/")).json()).ok === true);
      const a = await (await send({ from: "t1", code: "R1-14-A", note: "attack", note2: "ai" })).json();
      const b = await (await send({ from: "t2", code: "R1-MSG", note: "{\"text\":\"hi\"}" })).json();
      r.check("messages are numbered in order", a.seq === 1 && b.seq === 2, JSON.stringify([a, b]));
      const t1 = await poll("t1"), t2 = await poll("t2"), mod = await poll("mod");
      r.check("team 1 gets only team 2's messages", t1.messages.length === 1 && t1.messages[0].from === "t2");
      r.check("team 2 gets only team 1's messages", t2.messages.length === 1 && t2.messages[0].from === "t1");
      r.check("the moderator gets everything", mod.messages.length === 2);
      r.check("notes arrive unchanged", t2.messages[0].note === "attack" && t2.messages[0].note2 === "ai");
      r.check("'since' skips what a screen already has", (await poll("mod", 2)).messages.length === 0);

      r.check("the moderator cannot send moves", (await send({ from: "mod", code: "X" })).status === 400);
      const setupRoom = relay + "/room/setup-" + Date.now() + "/send";   // its own room, so the messages above are undisturbed
      const setupSend = code => fetch(setupRoom, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "mod", code }) }).then(x => x.status);
      r.check("...but may post an exercise's settings (a join code, build 16), and still not a join", (await setupSend("R0-SETUP")) === 200 && (await setupSend("R0-JOIN")) === 400);
      const modRoom = relay + "/room/mod-" + Date.now() + "/send";
      const modSend = code => fetch(modRoom, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "mod", code }) });
      r.check("the moderator can send clock changes", (await modSend("R2-CLK")).status === 200);
      r.check("poll says when each message was stored, and what time the relay thinks it is", typeof mod.now === "number" && Math.abs(mod.now - Date.now()) < 10000 && mod.messages.every(m => typeof m.at === "number" && m.at <= mod.now && m.at > mod.now - 10000), JSON.stringify(mod).slice(0, 200));
      r.check("the moderator can send end early and resume", (await modSend("R2-END")).status === 200 && (await modSend("R2-RESUME")).status === 200);
      r.check("an unknown side cannot send", (await send({ from: "zz", code: "X" })).status === 400);
      r.check("a message needs a code", (await send({ from: "t1", code: "" })).status === 400);
      r.check("a bad room name is refused", (await fetch(relay + "/room/BAD/poll?as=t1")).status === 400);
      r.check("poll needs a valid side", (await fetch(room + "/poll?as=zz")).status === 400);
      r.check("unknown paths are 404", (await fetch(relay + "/nope")).status === 404);
      r.check("oversized messages are refused", (await send({ from: "t1", code: "R1-MSG", note: "x".repeat(1.6 * 1024 * 1024) })).status === 413);

      const pre = await fetch(room + "/send", { method: "OPTIONS", headers: { origin: "https://ballotship.electionadminsuite.com" } });
      r.check("browser permission (CORS) preflight passes", pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*");

      const flood = relay + "/room/flood-" + Date.now() + "/poll?as=t1";
      let limited = 0;
      for (let i = 0; i < 420; i++) if ((await fetch(flood)).status === 429) limited++;
      r.check("a flooded room is slowed down (429 after 400/minute)", limited === 20, limited + " refused");
      r.check("other rooms are unaffected by a flood", (await poll("t1")).messages.length === 1);
    });
    // ---- rooms are deleted after their last message ----
    await withRelay(async relay => {
      const sleep = ms => new Promise(x => setTimeout(x, ms));
      const room = relay + "/room/ttl-" + Date.now();
      const send = (note) => fetch(room + "/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "t1", code: "R1-MSG", note }) }).then(x => x.json());
      const count = async () => (await (await fetch(room + "/poll?as=mod&since=0")).json()).messages.length;
      await send("one");
      await sleep(2000);
      const two = await send("two");                 // 2 s in: this resets the 3-second clock
      await sleep(2000);                             // 4 s after the first, 2 s after the second
      r.check("a message resets the clock: the room is still there 4 s after the first message of a 3 s lifetime", (await count()) === 2 && two.seq === 2, "" + (await count()));
      await sleep(2600);                             // now more than 3 s after the last message
      r.check("...and is gone about 3 s after the LAST message", (await count()) === 0);
      const again = await send("fresh");
      r.check("...and the same room name works again, starting from message 1", again.ok === true && again.seq === 1 && (await count()) === 1, JSON.stringify(again));
      await sleep(3600);
      r.check("...and is deleted again in the same way", (await count()) === 0);
    }, { fresh: true, vars: { ROOM_TTL_SECONDS: "3" } });
  } catch (e) {
    r.fail("test crashed", e.message);
  }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
