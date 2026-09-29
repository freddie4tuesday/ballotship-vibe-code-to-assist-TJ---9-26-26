/*
  Plays Ballotship in a browser, one step at a time, in any of the three ways of
  playing: "pass" (one screen passed), "relay" (two screens taking turns) and
  "sim" (two screens simultaneous). Used by shot-marks and end-early tests.
*/
const { PAGE, screenOn, joinGame } = require("./helpers");
const codes = {};   // room key -> the join code its host got (build 16: the first screen of a room sets up, the rest join)

const TEXT = "Automated test entry, written by the shot-marks test.";
const setVals = (p, sel) => p.evaluate(([sel, t]) => {
  document.querySelectorAll(sel).forEach(e => { if (e.offsetParent !== null && !e.value) { e.value = t; e.dispatchEvent(new Event("input", { bubbles: true })); } });
}, [sel, TEXT]);

async function setup(browser, mode, side, relay, room, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(ms => { window.BALLOTSHIP_POLL_MS = ms; }, opts.pollMs || 150);
  await ctx.addInitScript(u => { window.BALLOTSHIP_RELAY_URL = u; }, relay || "http://127.0.0.1:9");   // the page's relay is the local one; with none given, an unreachable one, so a test can never reach the live relay (build 17: two-screen modes always use the relay)
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(PAGE);
  /* Build 16: with a relay, the first screen of a room sets the exercise up and the others join with its code.
     A moderator, if there is one, must be the first (the moderator sets up when there is one). */
  if (relay && codes[room]) { await joinGame(p, codes[room], side); registry[side] = p; return { p, errors }; }
  await p.click("#btnTitleGo");
  await p.click({ pass: "#modePass", relay: "#modeRelay", sim: "#modeSim" }[mode]);
  if (side) await p.click({ t1: "#sideT1", t2: "#sideT2", mod: "#sideMod" }[side]);
  await p.selectOption("#rounds", String(opts.rounds || 4));
  if (opts.clock) {                                   // one laptop / taking turns: "Use a clock", with times like "0:05"
    await p.check("#optClock");
    await p.evaluate(([a, d]) => { document.getElementById("durA").value = a; document.getElementById("durD").value = d; }, [opts.clock.a || "10:00", opts.clock.d || "10:00"]);
  }
  if (!(await p.isChecked("#optAuto"))) await p.check("#optAuto");
  for (const id of ["#optSfx", "#optChime"]) if (await p.isChecked(id)) await p.uncheck(id);
  if (opts.ai) { if (!(await p.isChecked("#optAI"))) await p.check("#optAI"); }          // build 17: the AI assignment is off unless asked for
  else if (await p.isChecked("#optAI")) await p.uncheck("#optAI");
  await p.click("#btnStart");
  if (relay) { await p.waitForFunction(() => window.G && G.joinCode, null, { timeout: 15000 }); codes[room] = await p.evaluate(() => G.joinCode); }
  if (side) registry[side] = p;
  return { p, errors };
}

/* Shots are scripted, not random. Team 1 always aims where the other county has a site that
   hasn't been hit (a hit); team 2 always aims at empty water (a miss); neither repeats a
   cell it has already fired at. Random shots tie now and then, and a tied simultaneous game
   goes into sudden death on the taking-turns screens (a question for TJ, on the roadmap),
   which these tests aren't about and can't drive. Falls back to a random cell if it runs out. */
const registry = {};                       // side -> page, filled in by setup()
async function scriptedAim(p, mode) {
  const who = await p.evaluate(m => { const me = m === "pass" ? G.pending.atkKey : G.me; return { me, other: me === "t1" ? "t2" : "t1" }; }, mode);
  const source = mode === "pass" ? p : registry[who.other];      // the page that knows the other county's board
  if (!source) return null;
  const other = await source.evaluate(o => ({ board: G.teams[o].board, hits: G.teams[o].hits }), who.other);
  return p.evaluate(([me, other, mode]) => {
    const card = G.sim ? G.R.card : G.pending.card, shots = G.teams[me].shots, need = SHAPES[card.shape].cells.length;
    for (let o = 0; o < 36; o++) {
      const cells = footprint(o, card.shape);
      if (cells.length < need || cells.some(c => shots[c])) continue;       // off the grid, or fired at before
      if (cells.some(c => other.board[c] && !other.hits[c]) === (me === "t1")) return cellLabel(o);
    }
    return null;
  }, [who.me, other, mode]);
}

/* One step on one screen: whatever that screen needs next. 'fired' holds, per
   team, every cell it has fired at; 'results' collects what the tests check. */
async function step(p, mode, fired, results) {
  fired = fired || {}; results = results || [];
  if (await p.isVisible("#aimSheet")) {
    const team = await p.evaluate(m => m === "pass" ? G.pending.atkKey : G.me, mode);
    const want = fired[team] ? fired[team].size : 0;
    const shown = await p.$$eval("#aimGrid .cell.miss, #aimGrid .cell.down", els => els.length);
    if (want > 0) results.push({ team, round: await p.evaluate(() => G.round), want, shown });
    const label = await scriptedAim(p, mode).catch(() => null);
    if (label) await p.click('#aimGrid button[aria-label="' + label + '"]');
    else { const cells = await p.$$("#aimGrid button.cell.pick:not(.miss):not(.down)"); await cells[Math.floor(Math.random() * cells.length)].click(); }
    await p.click("#btnAimOk");
    return;
  }
  const s = await screenOn(p);
  const click = sel => p.click(sel).catch(() => {});
  // The "Inject landed on you" brief opens over the defense screen; read it and close it.
  if (await p.isVisible("#briefSheet")) {
    if (s === "screen-defense" || s === "screen-sim-defense") {
      const words = await p.$eval("#briefWhat .briefq:first-child", e => e.textContent).catch(() => "");   // the attack block, not the AI one
      const key = (await p.evaluate(() => G.round)) + "-" + (await p.evaluate(m => m === "pass" ? G.pending.defKey : G.me, mode));
      results.brief = results.brief || {};
      if (!(key in results.brief)) results.brief[key] = words.includes(TEXT);
    }
    return click("#btnBriefX");
  }
  if (s === "screen-gate") return click("#btnGate");
  if (s === "screen-offense") {
    const need = await p.evaluate(() => !G.pending.card.crisis && G.pending.origin == null);
    if (need) return click("#offAim button");
    await setVals(p, "#screen-offense textarea, #screen-offense input[type=text]");
    const f = await p.evaluate(() => ({ team: G.pending.atkKey, cells: G.pending.card.crisis ? [] : G.pending.cells }));
    await click("#btnCommitAttack");
    if (!(await p.isVisible("#screen-offense.on"))) { fired[f.team] = fired[f.team] || new Set(); f.cells.forEach(c => fired[f.team].add(c)); }
    return;
  }
  if (s === "screen-sim-attack") {
    const need = await p.evaluate(() => !G.R.card.crisis && G.R.mine.origin == null);
    if (need) return click("#saAim button");
    await setVals(p, "#saForm textarea, #saForm input[type=text]");
    const f = await p.evaluate(() => ({ team: G.me, cells: G.R.card.crisis ? [] : G.R.mine.cells }));
    await click("#btnSaCommit");
    if (!(await p.isVisible("#screen-sim-attack.on"))) { fired[f.team] = fired[f.team] || new Set(); f.cells.forEach(c => fired[f.team].add(c)); }
    return;
  }
  if (s === "screen-send") return click("#btnSent");
  if (s === "screen-defense" || s === "screen-sim-defense") {
    const box = await p.$eval(s === "screen-defense" ? "#theirAttack" : "#sdAttack", e => e.textContent).catch(() => "");
    const key = (await p.evaluate(() => G.round)) + "-" + (await p.evaluate(m => m === "pass" ? G.pending.defKey : G.me, mode));
    results.words = results.words || {};
    if (!(key in results.words)) results.words[key] = box.includes(TEXT);
  }
  if (s === "screen-defense") { await setVals(p, "#screen-defense textarea, #screen-defense input[type=text]"); return click("#btnCommitDefense"); }
  if (s === "screen-crisis" || s === "screen-sim-defense") {
    const grid = s === "screen-crisis" ? "#crisGrid" : "#sdGrid";
    const labels = await p.evaluate(([s, mode]) => {
      const me = G.teams[s === "screen-crisis" && mode === "pass" ? G.pending.defKey : G.me];
      const need = s === "screen-crisis" ? G.pending.crisisNeed : (G.R.card.crisis ? G.R.resp.need : 0);
      const have = s === "screen-crisis" ? 0 : G.R.resp.pick.length, out = [];
      for (let i = 0; i < 36 && out.length < need - have; i++) if (me.board[i] && !me.hits[i]) out.push(cellLabel(i));
      return out;
    }, [s, mode]);
    for (const l of labels) await click(grid + ' [aria-label="' + l + '"]');
    await setVals(p, "#" + s + " textarea, #" + s + " input[type=text]");
    return click(s === "screen-crisis" ? "#btnCrisDone" : "#btnSdCommit");
  }
  if (s === "screen-resolve") return click("#btnEndTurn");
  if (s === "screen-atkresult") return click("#btnArDone");
  if (s === "screen-sim-resolve") return click("#btnSrNext");
}


module.exports = { TEXT, setVals, setup, step };
