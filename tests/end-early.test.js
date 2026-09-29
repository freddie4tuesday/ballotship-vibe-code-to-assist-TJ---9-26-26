/*
  End early, and resume (build 6), in every way of playing.

  For each way of playing: play into round 2, press End early, confirm, and check
  the final screen (both screens, when there are two, including when the
  moderator ends it). Then reload the page to check the ended game survives,
  press Resume the game, and check every screen is back exactly where it was.
  Then play on to the real end. Also checks that starting a new exercise, or
  discarding a saved one, asks first.
*/
const { reporter, withRelay, launch, screenOn } = require("./helpers");
const { setup, step } = require("./driver");

const fingerprint = p => p.evaluate(() => JSON.stringify({ me: G.me || null, round: G.round, phase: G.phase, sim: G.simPhase || null,
  down: G.teams && G.teams.t1 && G.teams.t2 ? [G.teams.t1.cellsDown, G.teams.t2.cellsDown] : "no teams:" + Object.keys(G.teams || {}).join("/"),
  log: G.log.length }));
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 250)); } return false; };

async function run(browser, mode, relay, r, ender) {
  const room = "end-" + mode.replace(/[^a-z]/g, "-") + "-" + Date.now();   // room names allow only letters, numbers and hyphens
  const sides = mode === "pass" ? [null] : mode === "sim+mod" ? ["t1", "t2", "mod"] : ["t1", "t2"];
  const m = mode === "sim+mod" ? "sim" : mode;
  const screens = [];
  // Three screens at the default test speed would pass the relay's 400-a-minute room limit on their own.
  // The moderator sets up when there is one (build 16), so it is created first; the screens are kept in `sides` order.
  const made = {};
  for (const s of (sides.includes("mod") ? ["mod", ...sides.filter(x => x !== "mod")] : sides)) made[s] = await setup(browser, m, s, mode === "pass" ? null : relay, room, { pollMs: sides.length > 2 ? 600 : 150 });
  for (const s of sides) screens.push(made[s]);
  const players = screens.filter((x, i) => sides[i] !== "mod");
  const mod = screens[sides.indexOf("mod")];
  // A moderator presses "Start round N" as the teams move on (not "End the exercise").
  const modStep = async () => {
    if (!mod || !(await mod.p.isVisible("#btnMdNext"))) return;
    const last = await mod.p.evaluate(() => G.round >= G.maxRounds);
    const teamsDone = (await Promise.all(players.map(x => screenOn(x.p)))).every(x => x === "screen-over");
    if (!last || teamsDone) await mod.p.click("#btnMdNext").catch(() => {});   // at the end it reads "End the exercise"
  };
  const label = mode + (ender ? " (" + ender + " ends it)" : "");

  // Play into round 2.
  await until(async () => {
    for (const { p } of players) await step(p, m).catch(() => {});
    await modStep();
    return (await players[0].p.evaluate(() => G.round)) >= 2 && (!mod || (await mod.p.evaluate(() => G.round)) >= 2) && !(await players[0].p.isVisible("#aimSheet"));
  }, 120000);
  await players[0].p.waitForTimeout(1500);
  const before = await Promise.all(screens.map(s => fingerprint(s.p)));

  // End early.
  const E = screens[ender === "mod" ? 2 : 0].p;
  const shown = await until(() => E.isVisible("#btnEndEarly"), 10000);
  r.check(label + ": End early is in the top bar", shown, shown ? "" : await E.evaluate(() => JSON.stringify({ screen: (document.querySelector(".screen.on") || {}).id,
    me: window.G && G.me, phase: window.G && G.phase, over: window.G && G.over, mast: document.querySelector(".masthead").hidden,
    btn: document.getElementById("btnEndEarly").hidden, title: document.title })));
  if (!shown) throw new Error("End early never appeared; page errors: " + screens.map((s, i) => sides[i] + ": " + s.errors.join(" / ")).join(" | "));
  await E.click("#btnEndEarly");
  const lede = await E.textContent("#endLede");
  r.check(label + ": the pop-up names the round", /round 2 of 4/.test(lede), lede);
  if (mode !== "pass") r.check(label + ": no 'press it on the other screen' note with the relay on", !(await E.isVisible("#endNote")));
  await E.click("#btnEndNow");
  const allOver = await until(async () => (await Promise.all(screens.map(s => screenOn(s.p)))).every(x => x === "screen-over"), 15000);
  r.check(label + ": every screen goes to the final screen", allOver, (await Promise.all(screens.map(s => screenOn(s.p)))).join(", "));
  const early = await players[0].p.textContent("#overEarly");
  r.check(label + ": final screen says it ended early", /Ended early in round 2 of 4\./.test(early), early);
  r.check(label + ": Resume the game and Download the log are offered",
    (await players[0].p.isVisible("#btnResumeGame")) && (await players[0].p.isVisible("#btnExport")));

  // Survives a reload.
  const P = players[0].p;
  await P.reload();
  const panel = await P.isVisible("#resumePanel") || (await P.click("#btnTitleGo").then(() => P.isVisible("#resumePanel")).catch(() => false));
  r.check(label + ": after a reload the ended game is offered back", panel);
  if (panel) { await P.click("#btnResume"); await P.waitForTimeout(500); }
  r.check(label + ": ...and Resume the game is still there", await P.isVisible("#btnResumeGame"));

  // Resume.
  await P.click("#btnResumeGame");
  const back = await until(async () => {
    const now = await Promise.all(screens.map(s => fingerprint(s.p)));
    return now.every((f, i) => f === before[i]);
  }, 15000);
  const after = await Promise.all(screens.map(s => fingerprint(s.p)));
  r.check(label + ": every screen is back exactly where it was", back, "before " + before.join(" | ") + " after " + after.join(" | "));
  r.check(label + ": End early is back in the top bar", await P.isVisible("#btnEndEarly"));

  // Play on to the real end.
  const done = await until(async () => {
    for (const { p } of players) await step(p, m).catch(() => {});
    await modStep();
    return (await Promise.all(screens.map(s => screenOn(s.p)))).every(x => x === "screen-over");
  }, 240000);
  const endState = await Promise.all(screens.map(s => s.p.evaluate(() => ({ me: G.me, screen: (document.querySelector(".screen.on") || {}).id,
    over: G.over, winner: G.winner || null, why: G.why || null, down: [G.teams.t1.cellsDown, G.teams.t2.cellsDown],
    off: [Object.keys(G.teams.t1.offline).filter(k => G.teams.t1.offline[k]).sort().join("+"), Object.keys(G.teams.t2.offline).filter(k => G.teams.t2.offline[k]).sort().join("+")] }))));
  if (!done) console.log("        end state: " + JSON.stringify(endState));
  r.check(label + ": the game then plays on to the real end", done, endState.map(x => x.screen).join(", "));
  r.check(label + ": a full game isn't marked as ended early", done && !(await P.isVisible("#overEarly")) && !(await P.isVisible("#btnResumeGame")));
  if (endState.some(x => x.me === "mod")) {
    // The moderator has no board, so it reads each county's damage from the result codes (build 8).
    const same = endState.every(x => JSON.stringify([x.winner, x.why, x.down, x.off]) === JSON.stringify([endState[0].winner, endState[0].why, endState[0].down, endState[0].off]));
    r.check(label + ": the moderator's final score matches the teams' (winner, damage, sites offline)", same, JSON.stringify(endState.map(x => [x.me, x.winner, x.why, x.down, x.off])));
    r.check(label + ": ...and it isn't 0-0", endState.find(x => x.me === "mod").down.some(n => n > 0));
  }
  const errs = screens.flatMap(s => s.errors);
  r.check(label + ": no JavaScript errors", errs.length === 0, errs.join("; "));
  return screens;
}

(async () => {
  const r = reporter("End early and resume (all three ways of playing)");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const modes = (process.env.MODES || "pass,relay,sim,sim+mod").split(",").filter(m => m !== "one");   // MODES=one runs only the 1-round check
      for (const m of modes) {
        const screens = await run(browser, m, relay, r, m === "sim+mod" ? "mod" : null);
        if (m === "pass") {
          // Asking before a saved game is replaced or discarded.
          const p = screens[0].p, dialogs = [];
          p.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
          await p.reload();
          await p.click("#btnTitleGo");
          await p.click("#btnStart");
          r.check("starting a new exercise asks before replacing the saved one", dialogs.some(x => /replaces the saved one/.test(x)), dialogs.join(" | "));
          r.check("...and saying no keeps it", (await screenOn(p)) === "screen-setup" && (await p.isVisible("#resumePanel")));
          await p.click("#btnDiscard");
          r.check("discarding a saved exercise asks first", dialogs.some(x => /Discard the saved exercise/.test(x)));
          r.check("...and saying no keeps it", await p.isVisible("#resumePanel"));
        }
        for (const s of screens) await s.p.context().close();
      }
      if (!process.env.MODES || /one/.test(process.env.MODES)) {
        // The "1 round (for testing purposes)" choice plays a whole short game.
        const one = await setup(browser, "pass", null, null, null, { rounds: 1 });
        const over = await until(async () => { await step(one.p, "pass").catch(() => {}); return (await screenOn(one.p)) === "screen-over"; }, 120000);
        const rounds = await one.p.evaluate(() => G.round + " of " + G.maxRounds + (G.suddenDeath ? " (sudden death)" : ""));
        r.check("a 1-round game plays to the final screen (" + rounds + ")", over);
        r.check("...with no JavaScript errors", one.errors.length === 0, one.errors.join("; "));
        await one.p.context().close();
      }
    });
  } catch (e) { r.fail("test crashed", e.message); console.log(e.stack); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
