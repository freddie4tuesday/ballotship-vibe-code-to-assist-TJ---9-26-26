/*
  Clocks stay in step (build 11), in a simultaneous game with two teams and a moderator.

  Each screen runs its own clock; what is sent is a change (pause, resume, +1:00, -1:00,
  reset), as the clock's whole state, stamped by the relay. Checks that:
    - a change on any screen reaches the other two, and they show the same time
    - a screen that hears LATE (checking only every 5 s here) ends up exactly right, not behind
    - two people pressing different buttons at once settle on the same clock everywhere
    - one message goes out per press, and nothing is sent while nobody acts
    - a clock at zero takes one last look at the relay and does NOT commit if a pause is waiting
      there, but does commit if there isn't one
    - a change for a phase a screen hasn't reached yet is kept, and applied when it gets there
*/
const { reporter, withRelay, launch, screenOn } = require("./helpers");
const { setup, step } = require("./driver");

const ck = p => p.evaluate(() => { const c = G.clock; return c ? { left: clockLeft(), running: c.running, ver: c.ver, by: c.by, key: c.key, phase: c.phase } : null; });
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
const press = (p, sel) => p.$eval(sel, e => e.click());
const B = { team: { go: "#btnClkGo", plus: "#btnClkPlus", minus: "#btnClkMinus", reset: "#btnClkReset" }, mod: { go: "#btnMdGo", plus: "#btnMdPlus", minus: "#btnMdMinus", reset: "#btnMdReset" } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function relayMsgs(relay, room) {
  let since = 0, out = [];
  for (;;) {
    const j = await (await fetch(relay + "/room/" + room + "/poll?as=mod&since=" + since)).json();
    out = out.concat(j.messages);
    if (j.messages.length < 50) return out;
    since = j.messages[j.messages.length - 1].seq;
  }
}

(async () => {
  const r = reporter("Clocks stay in step (simultaneous game, two teams and a moderator)");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const room = "clk-" + Date.now();
      const opts = { pollMs: 700 };
      const t1 = await setup(browser, "sim", "t1", relay, room, opts), t2 = await setup(browser, "sim", "t2", relay, room, opts), mod = await setup(browser, "sim", "mod", relay, room, opts);
      const all = [t1, t2, mod], errors = () => all.flatMap(s => s.errors);
      await until(async () => (await screenOn(t1.p)) === "screen-sim-attack" && (await screenOn(t2.p)) === "screen-sim-attack" && (await screenOn(mod.p)) === "screen-mod", 30000);
      const clocks = async () => Promise.all(all.map(s => ck(s.p)));
      const settled = async (pred, ms) => until(async () => pred(await clocks()), ms || 12000);
      const cmsgs = async () => (await relayMsgs(relay, room)).filter(m => /-CLK$/.test(m.code));
      const start = await clocks();
      r.check("all three clocks start together, paused at the full time (round 1)", start.every(c => c && !c.running && near(c.left, start[0].left, 1)), JSON.stringify(start));

      // A. start, from a team; pause, from the moderator
      await press(t1.p, B.team.go);
      r.check("Start on team 1 starts the other two clocks", await settled(cs => cs.every(c => c.running), 12000));
      let cs = await clocks();
      r.check("...and all three show the same time (within 1.5 s)", cs.every(c => near(c.left, cs[0].left, 1.5)), cs.map(c => c.left.toFixed(1)).join(" / "));
      await press(mod.p, B.mod.go);
      r.check("Pause on the moderator pauses both team clocks", await settled(cs => cs.every(c => !c.running), 12000));
      cs = await clocks();
      r.check("...at the same time left (within 1 s)", cs.every(c => near(c.left, cs[0].left, 1)), cs.map(c => c.left.toFixed(1)).join(" / "));

      // B. add a minute from a team; take a minute from the moderator
      const before = (await clocks())[0].left;
      await press(t2.p, B.team.plus);
      r.check("+1:00 on team 2 adds a minute on all three", await settled(cs => cs.every(c => near(c.left, before + 60, 1.5))), JSON.stringify((await clocks()).map(c => Math.round(c.left))));
      await press(mod.p, B.mod.minus);
      r.check("-1:00 on the moderator takes it back on all three", await settled(cs => cs.every(c => near(c.left, before, 1.5))), JSON.stringify((await clocks()).map(c => Math.round(c.left))));

      // C. reset
      await press(t1.p, B.team.reset);
      r.check("Reset on team 1 puts all three back to the full time, paused", await settled(cs => cs.every(c => !c.running && near(c.left, 600, 1))), JSON.stringify(await clocks()));

      // D. a screen that hears late is corrected, not left behind
      await t2.p.evaluate(() => { window.BALLOTSHIP_POLL_MS = 5000; });
      await t2.p.waitForTimeout(1500);                                          // its next check is now 5 s away
      await press(t1.p, B.team.go);
      const heard = await until(async () => (await ck(t2.p)).running, 15000);
      const c1 = await ck(t1.p), c2 = await ck(t2.p);
      r.check("a screen that checks only every 5 s still hears the Start", heard);
      r.check("...and its clock matches team 1's within 1.5 s (without the correction it would be up to 5 s behind)", near(c1.left, c2.left, 1.5), c1.left.toFixed(1) + " vs " + c2.left.toFixed(1));
      await t2.p.evaluate(() => { window.BALLOTSHIP_POLL_MS = 700; });
      await press(t1.p, B.team.go);                                              // pause again
      await settled(cs => cs.every(c => !c.running));

      // E. two people press different buttons at the same moment
      await press(mod.p, B.mod.reset);
      await settled(cs => cs.every(c => !c.running && near(c.left, 600, 1)));
      await Promise.all([press(t1.p, B.team.plus), press(t2.p, B.team.minus)]);
      const conv = await settled(cs => cs.every(c => c.ver === cs[0].ver && c.by === cs[0].by && near(c.left, cs[0].left, 1)), 15000);
      cs = await clocks();
      r.check("+1:00 on one team and -1:00 on the other at the same moment: all three end on the same clock", conv, JSON.stringify(cs.map(c => [Math.round(c.left), c.ver, c.by])));
      r.check("...the same one everywhere (the later team name wins a tie: team 2's minus)", cs.every(c => c.by === "t2" && near(c.left, 540, 1.5)), JSON.stringify(cs.map(c => [Math.round(c.left), c.by])));

      // F. one message per press, none while idle
      const n1 = (await cmsgs()).length;
      r.check("one message went out per press (" + n1 + " messages for the 10 presses so far)", n1 === 10, n1 + " messages");
      await new Promise(x => setTimeout(x, 6000));
      const n2 = (await cmsgs()).length;
      r.check("nothing is sent while nobody touches a clock", n2 === n1, n1 + " -> " + n2);

      // G. the last look at zero
      await press(mod.p, B.mod.reset);
      await settled(cs => cs.every(c => !c.running && near(c.left, 600, 1)));
      await t1.p.evaluate(() => { window.BALLOTSHIP_POLL_MS = 60000; });
      await t1.p.waitForTimeout(2000);                                           // team 1 now checks only once a minute
      await t1.p.evaluate(() => { G.clock.left = 2.5; G.clock.running = true; G.clock.endsAt = Date.now() + 2500; chimedFor = null; paintClock(); });
      await press(mod.p, B.mod.go); await mod.p.waitForTimeout(300); await press(mod.p, B.mod.go);   // moderator starts, then pauses
      await t1.p.waitForTimeout(6000);
      const held = await t1.p.evaluate(() => ({ phase: G.simPhase, running: G.clock.running, left: clockLeft() }));
      const modLeft = (await ck(mod.p)).left;
      r.check("a clock that reaches zero while a pause is waiting at the relay does NOT commit (last look)", held.phase === "attack", JSON.stringify(held));
      r.check("...it takes the pause instead, at the moderator's time", !held.running && near(held.left, modLeft, 1.5), held.left.toFixed(1) + " vs " + modLeft.toFixed(1));

      // H. a change for a phase this screen hasn't reached is kept
      await t1.p.evaluate(() => { window.BALLOTSHIP_POLL_MS = 700; pollNow(); });   // its next check was scheduled a minute out
      await fetch(relay + "/room/" + room + "/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "mod", code: "R1-CLK", note: JSON.stringify({ k: "1:defense", r: 1, p: "defense", left: 123, running: false, ver: 50, by: "mod" }) }) });
      const stashed = await until(async () => (await Promise.all([t1.p, t2.p].map(p => p.evaluate(() => !!(G.clockPending && G.clockPending["1:defense"]))))).every(Boolean), 12000);
      r.check("a change for the response clock, sent before either team has reached it, is kept on both team screens", stashed);

      // and: a clock at zero with nothing waiting at the relay does commit
      await t1.p.evaluate(() => { G.clock.left = 1.5; G.clock.running = true; G.clock.endsAt = Date.now() + 1500; chimedFor = null; paintClock(); });
      const committed = await until(async () => (await t1.p.evaluate(() => G.simPhase)) !== "attack", 12000);
      r.check("a clock that reaches zero with nothing waiting commits what is written (team 1 moves on)", committed, await t1.p.evaluate(() => G.simPhase));
      await until(async () => { await step(t2.p, "sim").catch(() => {}); return (await screenOn(t1.p)) === "screen-sim-defense" && (await screenOn(t2.p)) === "screen-sim-defense"; }, 60000);
      const d1 = await ck(t1.p), d2 = await ck(t2.p);
      r.check("both teams enter the response phase, and its clock takes the kept change (paused, 123 s left, version 50)",
        [d1, d2].every(c => c && c.key === "1:defense" && !c.running && near(c.left, 123, 1.5) && c.ver === 50), JSON.stringify([d1, d2]));
      r.check("no JavaScript errors", errors().length === 0, errors().join("; "));
    });
  } catch (e) { r.fail("test crashed", e.message); console.log(e.stack); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
