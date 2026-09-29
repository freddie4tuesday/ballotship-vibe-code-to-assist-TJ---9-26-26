/*
  Earlier shots on the target picker, and the attack's written words on the
  defense screen, in every way of playing.

  Each time a team opens "Pick your target", its earlier hits and misses on the
  other team's grid must be marked, or the guessing half of the game has nothing
  to go on. Plays 4 rounds in each mode — one screen passed, two screens taking
  turns through the relay, and two screens simultaneous — and at every picker
  opening compares the marked cells with the cells that team has actually fired
  at so far. Also checks that the defending team is shown what the attacking team
  wrote. (Added for build 5: passing the laptop did neither.)
  MODES=pass,relay,sim picks which ways to play (default all three).
*/
const { reporter, withRelay, launch, screenOn } = require("./helpers");
const { TEXT, setup, step } = require("./driver");

async function play(browser, mode, relay, r) {
  const room = "marks-" + mode + "-" + Date.now();
  const screens = mode === "pass" ? [await setup(browser, mode, null)] :
    [await setup(browser, mode, "t1", relay, room), await setup(browser, mode, "t2", relay, room)];
  const fired = {}, results = [];
  const end = Date.now() + 240000;
  while (Date.now() < end) {
    let over = true;
    for (const { p } of screens) if ((await screenOn(p)) !== "screen-over") over = false;
    if (over) break;
    for (const { p } of screens) await step(p, mode, fired, results).catch(() => {});
    await screens[0].p.waitForTimeout(150);
  }
  const finished = (await Promise.all(screens.map(({ p }) => screenOn(p)))).every(s => s === "screen-over");
  r.check(mode + ": game played to the end", finished, (await Promise.all(screens.map(({ p }) => screenOn(p)))).join(", "));
  r.check(mode + ": picker reopened after earlier shots (" + results.length + " times)", results.length >= 2);
  const bad = results.filter(x => x.shown !== x.want);
  r.check(mode + ": every earlier hit and miss is marked on the picker", bad.length === 0,
    bad.map(x => x.team + " round " + x.round + ": " + x.shown + " of " + x.want + " marked").join("; "));
  const words = results.words || {}, missing = Object.keys(words).filter(k => !words[k]);
  r.check(mode + ": the defending team sees the attack as written (" + Object.keys(words).length + " defenses)",
    Object.keys(words).length >= 2 && missing.length === 0, "not shown for round-team " + missing.join(", "));
  const brief = results.brief || {}, bmiss = Object.keys(brief).filter(k => !brief[k]);
  r.check(mode + ": the \"inject landed on you\" brief shows the attack as written (" + Object.keys(brief).length + ")",
    bmiss.length === 0, "not shown for round-team " + bmiss.join(", "));
  const errs = screens.flatMap(s => s.errors);
  r.check(mode + ": no JavaScript errors", errs.length === 0, errs.join("; "));
  for (const { p } of screens) await p.context().close();
}

(async () => {
  const r = reporter("Earlier shots shown on the target picker (all three ways of playing)");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const modes = (process.env.MODES || "pass,relay,sim").split(",");
      for (const m of modes) await play(browser, m, m === "pass" ? null : relay, r);
    });
  } catch (e) { r.fail("test crashed", e.message); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
