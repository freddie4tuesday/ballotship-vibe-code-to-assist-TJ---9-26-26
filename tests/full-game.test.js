/*
  Full game through the relay: team 1, team 2 and a moderator play a 4-round
  simultaneous game start to finish. Each round both teams aim, write an
  attack, commit, receive the other's attack, write a response (choosing
  cells on a jurisdiction-wide crisis inject), commit, and go to the next
  round. Checks the game ends on every screen, all screens agree on the
  winner, the boards agree across screens, and nothing throws.
*/
const { reporter, withRelay, launch, setupScreens, screenOn } = require("./helpers");

async function fillForm(p, formSel) {
  const fields = await p.$$(formSel + " textarea, " + formSel + " input[type=text]");
  for (const f of fields) if (await f.isVisible()) await f.fill("Automated test entry, written by the full-game test.");
}

/* Shots are scripted, not random: team 1 always aims where the other county has a site
   (a hit) and team 2 always aims at empty water (a miss). Random shots tie now and then,
   and a tied game used to go into a sudden-death round the test couldn't drive (removed in build 18:
   a tie is now a draw). Scripting them keeps the result the same every run. */
let PAGES = null;
async function aimLabel(p) {
  const me = await p.evaluate(() => G.me), other = me === "t1" ? "t2" : "t1";
  const board = await PAGES[other].evaluate(o => G.teams[o].board, other);
  return p.evaluate(([board, wantHit]) => {
    const shape = G.R.card.shape, need = SHAPES[shape].cells.length;
    for (let o = 0; o < 36; o++) {
      const cells = footprint(o, shape);
      if (cells.length < need) continue;                       // would run off the grid
      if (cells.some(c => board[c]) === wantHit) return cellLabel(o);
    }
    return null;
  }, [board, me === "t1"]);
}
async function pickAim(p) {
  if (!(await p.isVisible("#aimSheet"))) return false;
  const label = await aimLabel(p);
  if (label) await p.click('#aimGrid button[aria-label="' + label + '"]');
  else { const cells = await p.$$("#aimGrid button.cell.pick"); await cells[0].click(); }
  await p.click("#btnAimOk");
  return true;
}

/* One step for one team's screen. Returns a short label of what it did. */
async function step(p) {
  if (await pickAim(p)) return "aimed";
  const s = await screenOn(p);
  if (s === "screen-sim-attack") {
    if (!(await p.isVisible("#saCrisis")) && (await p.$eval("#saAim", e => /pick|choose|aim/i.test(e.textContent)).catch(() => false))) {
      const b = await p.$("#saAim button"); if (b) { await b.click(); if (await pickAim(p)) return "aimed"; }
    }
    await fillForm(p, "#saForm");
    await p.click("#btnSaCommit");
    return "attack";
  }
  if (s === "screen-sim-defense") {
    await p.evaluate(() => { const s = document.querySelector(".sheet:not([hidden]):not(#aimSheet)"); if (s) s.hidden = true; });
    await fillForm(p, "#sdForm");
    /* A crisis inject: the defender picks which cells go offline. The grid redraws after every click, so cells are
       looked up by their label each time (a list fetched once goes stale). This path first ran in a test at build 14,
       when the game began at inject 1 and reached the crisis injects (3 and 16) in a 4-round game. */
    const labels = await p.evaluate(() => {
      if (!(G.R && G.R.card && G.R.card.crisis)) return [];
      const me = G.teams[G.me], out = [];
      for (let i = 0; i < 36 && out.length < G.R.resp.need - G.R.resp.pick.length; i++) if (me.board[i] && !me.hits[i]) out.push(cellLabel(i));
      return out;
    });
    for (const l of labels) await p.click('#sdGrid [aria-label="' + l + '"]');
    await p.click("#btnSdCommit");
    return "response";
  }
  if (s === "screen-sim-resolve") { await p.click("#btnSrNext"); return "next"; }
  return s;
}

(async () => {
  const r = reporter("Full game (4 rounds, three screens, through the relay)");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const { pages, errors } = await setupScreens(browser, relay, ["t1", "t2", "mod"], { rounds: 4, pollMs: 600 });
      PAGES = pages;
      const end = Date.now() + 180000;
      const seen = { t1: new Set(), t2: new Set() };
      while (Date.now() < end) {
        const over = (await screenOn(pages.t1)) === "screen-over" && (await screenOn(pages.t2)) === "screen-over";
        if (over) break;
        for (const side of ["t1", "t2"]) {
          const did = await step(pages[side]).catch(e => "error: " + e.message.split("\n")[0]);
          seen[side].add(did);
        }
        // A real moderator presses "Start round N+1" as each round finishes.
        if (await pages.mod.isVisible("#btnMdNext") && (await pages.mod.evaluate(() => G.round < G.maxRounds))) await pages.mod.click("#btnMdNext").catch(() => {});
        await pages.t1.waitForTimeout(250);
      }
      for (const side of ["t1", "t2"]) {
        r.check(side + " reaches the end of the game", (await screenOn(pages[side])) === "screen-over",
          "stuck on " + (await screenOn(pages[side])) + "; saw " + [...seen[side]].join(", "));
      }
      const res = {};
      for (const side of ["t1", "t2", "mod"]) {
        res[side] = await pages[side].evaluate(() => ({
          over: G.over, winner: G.winner, why: G.why, round: G.round, max: G.maxRounds,
          down: { t1: G.teams.t1.cellsDown, t2: G.teams.t2.cellsDown },
        }));
      }
      r.check("played every round", res.t1.round >= 4, "ended at round " + res.t1.round);
      r.check("both teams agree on the winner", res.t1.winner === res.t2.winner && res.t1.why === res.t2.why,
        JSON.stringify([res.t1.winner, res.t1.why, res.t2.winner, res.t2.why]));
      r.check("both teams agree on the damage to each board",
        JSON.stringify(res.t1.down) === JSON.stringify(res.t2.down), JSON.stringify([res.t1.down, res.t2.down]));
      r.check("the moderator saw both teams' traffic", await pages.mod.evaluate(() =>
        G.thread.some(m => m.kind === "attack") && G.thread.some(m => m.kind === "response")));
      // The moderator ends the exercise too, and must agree with the teams on the score (build 8).
      await pages.mod.waitForSelector("#btnMdNext:not([hidden])", { timeout: 30000 }).catch(() => {});
      await pages.mod.$eval("#btnMdNext", e => e.click()).catch(() => {});
      await pages.mod.waitForFunction(() => G.over || (document.querySelector(".screen.on") || {}).id !== "screen-mod", null, { timeout: 15000 }).catch(() => {});
      const snap = p => p.evaluate(() => ({ screen: (document.querySelector(".screen.on") || {}).id, winner: G.winner || null, why: G.why || null,
        down: [G.teams.t1.cellsDown, G.teams.t2.cellsDown], off: [0, 1].map(i => Object.keys(G.teams["t" + (i + 1)].offline).filter(k => G.teams["t" + (i + 1)].offline[k]).sort().join("+")) }));
      const ms = await snap(pages.mod), ts = await snap(pages.t1);
      r.check("the moderator ends the exercise on the final screen", ms.screen === "screen-over", ms.screen);
      r.check("the moderator's final score matches the teams' (winner, damage, sites offline)", JSON.stringify([ms.winner, ms.why, ms.down, ms.off]) === JSON.stringify([ts.winner, ts.why, ts.down, ts.off]), JSON.stringify([ms, ts]));
      r.check("...and the moderator's top bar shows the damage too", await pages.mod.$$eval("#score .ci", els => els.map(e => parseInt(e.textContent, 10))).then(v => JSON.stringify(v) === JSON.stringify(ts.off.map(x => x ? x.split("+").length : 0))));
      r.check("polling stops once the game is over", await pages.t1.evaluate(() => G.over && !pollTimer));
      r.check("no JavaScript errors on any screen", errors.length === 0, errors.join("; "));
      console.log("        result: winner " + (res.t1.winner || "tie") + " by " + res.t1.why +
        ", cells down " + JSON.stringify(res.t1.down));
    });
  } catch (e) {
    r.fail("test crashed", e.message);
  } finally {
    if (browser) await browser.close();
  }
  process.exit(r.failures ? 1 : 0);
})();
