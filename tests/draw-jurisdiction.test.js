/*
  Build 18, on one laptop (one screen, passed):

  Draws: there is no tie-break round.
    - fewer sites offline wins; level on sites, fewer cells down wins; level on both is a DRAW, and the game ends there
      (no extra round), saying so in the approved words; the Rules describe the same
  Jurisdiction: a real one, typed once at setup, required.
    - starting without one is refused and says what to do
    - it appears in the response boxes' hint (in place of the "Pinal County" that used to be there for everyone), in the
      after-action log (with the deck version), and survives a reload
    - text typed into it is shown as text, not run
  The "Watch a demo" button is on the title screen and in the "New to Ballotship?" box, and opens the video in a new tab.
*/
const { reporter, launch, screenOn, PAGE } = require("./helpers");
const { setup, step } = require("./driver");

const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };

(async () => {
  const r = reporter("Draws, jurisdiction and the demo button");
  let browser;
  try {
    browser = await launch();
    const errors = [];

    // ---- the demo button and the setup checks ----
    {
      const ctx = await browser.newContext(), p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message));
      await ctx.addInitScript(() => { window.BALLOTSHIP_DECK_URL = ""; });
      await p.goto(PAGE);
      const t = await p.$eval("#btnTitleDemo", e => ({ text: e.textContent, href: e.getAttribute("href"), target: e.getAttribute("target"), rel: e.getAttribute("rel") }));
      r.check("the title screen has 'Watch a demo', opening the video in a new tab", t.text === "Watch a demo" && /^https:\/\/ballotship-demo\./.test(t.href) && t.target === "_blank" && /noopener/.test(t.rel), JSON.stringify(t));
      await p.click("#btnTitleGo");
      const b = await p.$eval("#btnSetupDemo", e => ({ text: e.textContent, inBox: !!e.closest(".newbox"), target: e.getAttribute("target") }));
      r.check("the 'New to Ballotship?' box has it too", b.text === "Watch a demo" && b.inBox && b.target === "_blank", JSON.stringify(b));
      const hint = await p.$eval("#jurisdiction", e => e.parentElement.textContent.replace(/\s+/g, " ").trim());
      r.check("the setup screen asks for the Jurisdiction, with the approved hint", hint === "Jurisdiction The real jurisdiction this exercise is for, for example Pinal County. It appears in the log and in the response hints.", hint);
      await p.click("#modePass");
      await p.click("#btnStart");
      const err = await p.$eval("#startErr", e => e.hidden ? "" : e.textContent);
      r.check("starting with no jurisdiction is refused, and says what to enter", err === "Enter the jurisdiction this exercise is for." && (await screenOn(p)) === "screen-setup" && !(await p.evaluate(() => !!(window.G && G.me !== undefined && G.teams))), err);
      await p.fill("#jurisdiction", "   "); await p.click("#btnStart");
      r.check("...and a jurisdiction of only spaces is the same as none", (await p.$eval("#startErr", e => e.textContent)) === "Enter the jurisdiction this exercise is for." && (await screenOn(p)) === "screen-setup");
      const rules = await p.evaluate(() => document.getElementById("rulesPanel").textContent.replace(/\s+/g, " "));
      r.check("the Rules say a level game is a draw (no sudden death)", /If they are level on both, the game is a draw\./.test(rules) && !/sudden death/i.test(rules));
      await ctx.close();
    }

    // ---- a game with a jurisdiction ----
    const J = "Pinal County <i>AZ</i>";
    const g = await setup(browser, "pass", null, null, null, { rounds: 1, jurisdiction: J }); const p = g.p;
    await p.click("#btnGate"); await until(async () => (await screenOn(p)) === "screen-offense", 5000);
    r.check("the game holds the jurisdiction, cleaned up", (await p.evaluate(() => G.jurisdiction)) === J);
    for (let i = 0; i < 40 && (await screenOn(p)) !== "screen-defense"; i++) { await step(p, "pass"); await p.waitForTimeout(120); }
    await p.evaluate(() => { const b = document.getElementById("briefSheet"); if (b && !b.hidden) document.getElementById("btnBriefX").click(); });
    const ph = await p.$eval("#def_policy", e => e.placeholder);
    r.check("the response box's hint names the entered jurisdiction, not Pinal County for everyone", ph === "Yes, no or partly. Name the election office or " + J + " policy, procedure or plan that guides it. If there is none, say what you are relying on instead.", ph);
    await p.reload(); await p.click("#btnTitleGo"); await p.click("#btnResume"); await p.waitForTimeout(400);
    r.check("a reload keeps the jurisdiction", (await p.evaluate(() => G.jurisdiction)) === J);
    for (let i = 0; i < 250 && (await screenOn(p)) !== "screen-over"; i++) { await step(p, "pass").catch(() => {}); await p.waitForTimeout(100); }
    r.check("the game reached the end", (await screenOn(p)) === "screen-over", await screenOn(p));
    const log = await p.evaluate(() => logHTML());
    r.check("the log says 'Jurisdiction: ...' with the jurisdiction as plain text", log.includes("<p class=meta>Jurisdiction: Pinal County &lt;i&gt;AZ&lt;/i&gt;.</p>") && !log.includes("<i>AZ</i>"));
    r.check("...and the inject deck version, on its own line near the top (this test uses the built-in deck)", log.includes("<p class=meta>Inject deck: built-in set (16 injects).</p>") && log.indexOf("Jurisdiction:") < log.indexOf("Inject deck:") && log.indexOf("Inject deck:") < log.indexOf("<h2>Outcome"));
    r.check("the log has no 'sudden death'", !/sudden death/i.test(log));

    // ---- draws: judged on the final screen's own rules ----
    const judge = async (fix) => {
      await p.evaluate(fix);
      await p.evaluate(() => { G.over = false; G.round = G.maxRounds; G.suddenDeath = undefined; judgeEnd(); });
      return p.evaluate(() => ({ screen: document.querySelector(".screen.on").id, winner: G.winner, why: G.why, headline: document.getElementById("overW").textContent, reason: document.getElementById("overWhy").textContent, round: G.round, max: G.maxRounds }));
    };
    // (each fix runs inside the page, so it is written out in full; a function from here isn't visible there)
    const SAME = "const a = G.teams.t1, b = G.teams.t2; a.offline = {}; b.offline = {}; a.cellsDown = 5; b.cellsDown = 5;";
    let o = await judge(new Function(SAME));
    r.check("level on sites and on cells: a draw, ended at once (no extra round)", o.screen === "screen-over" && o.winner === null && o.why === "tie" && o.headline === "Drawn" && o.round === o.max && o.max === 1, JSON.stringify(o));
    r.check("...saying so in the approved words", o.reason === "Level on sites offline and level on cells down, so the game is a draw. Two jurisdictions that placed well and got hit about the same. Go straight to the debrief.", o.reason);
    o = await judge(new Function(SAME + " G.teams.t2.cellsDown = 6;"));
    r.check("level on sites but fewer cells down: that team wins, not a draw", o.winner === "t1" && o.why === "cells", JSON.stringify(o));
    o = await judge(new Function(SAME + " G.teams.t1.offline = { [ASSETS[0].id]: true };"));
    r.check("fewer sites offline wins outright", o.winner === "t2" && o.why === "sites", JSON.stringify(o));
    r.check("no JavaScript errors", errors.concat(g.errors).length === 0, errors.concat(g.errors).join("; "));
    await p.context().close();
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
