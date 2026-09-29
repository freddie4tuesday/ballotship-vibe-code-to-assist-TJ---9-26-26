/*
  Relay rules, checked directly against a local copy of ../worker (no browser):
  message order, own-message filtering, moderator sees all, input checks,
  browser permission (CORS), size cap, and the per-room request limit.
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
  } catch (e) {
    r.fail("test crashed", e.message);
  }
  process.exit(r.failures ? 1 : 0);
})();
