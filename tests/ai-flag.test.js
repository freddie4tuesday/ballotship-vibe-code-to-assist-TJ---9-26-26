/*
  The AI assignment is a setup choice, off by default (build 17). Played on one laptop, one round, both ways:

  Off (the default):
    - the setup checkbox is unticked, and the Rules a facilitator reads have no AI paragraphs
    - the attack screen has no AI box, task or starter prompt; an attack commits without one
    - the defending team is shown no "made with AI" panel and the brief has no such question
    - the log (web page) has no AI lines, and the debrief prompts don't ask about AI
  On:
    - the Rules show the AI paragraphs and the attack screen shows the box
    - an attack can't be committed without it (and the message says what to do), and can once it is filled in
    - the defending team sees what was made, and the log records it, and the debrief asks about it
  A game saved with it on or off comes back the same way after a reload.
*/
const { reporter, launch, screenOn } = require("./helpers");
const { setup, setVals, step } = require("./driver");

const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
const hidden = (p, sel) => p.evaluate(s => [...document.querySelectorAll(s)].every(e => getComputedStyle(e).display === "none"), sel);
const shown = (p, sel) => p.evaluate(s => { const l = [...document.querySelectorAll(s)]; return l.length > 0 && l.every(e => getComputedStyle(e).display !== "none"); }, sel);

(async () => {
  const r = reporter("AI assignment as a setup choice");
  let browser;
  try {
    browser = await launch();
    for (const ai of [false, true]) {
      const tag = ai ? "AI on: " : "AI off (default): ";
      const g = await setup(browser, "pass", null, null, null, { rounds: 1, ai }); const p = g.p;
      // the setup screen is gone by now; check the Rules that a game screen offers, and the rest on the way
      await p.click("#btnGate");
      await until(async () => (await screenOn(p)) === "screen-offense", 5000);
      r.check(tag + "the checkbox setting reached the game", (await p.evaluate(() => G.requireAI)) === ai);
      r.check(tag + "the AI paragraphs of the Rules are " + (ai ? "shown" : "hidden"), ai ? await shown(p, ".ai-only:not(.rf)") : await hidden(p, ".ai-only:not(.rf)"));
      await step(p);                                                       // pick a target
      r.check(tag + "the attack screen " + (ai ? "shows" : "has no") + " AI box", (await p.isVisible("#off_ai")) === ai && (await p.isVisible("#off_aiTask")) === ai);
      await p.fill("#off_where", "Somewhere in the county, at a test site"); await p.fill("#off_what", "The automated test does the thing");
      await p.fill("#off_when", "At a set moment, because tests are precise"); await p.fill("#off_goal", "To find out whether the box is required");
      if (ai) {
        await p.click("#btnCommitAttack");
        const msg = await p.$eval("#offErr", e => e.hidden ? "" : e.textContent);
        r.check(tag + "the attack cannot be committed without it, and the message says what to do", /Run the AI task and say what you made/.test(msg) && (await screenOn(p)) === "screen-offense", msg);
        await p.fill("#off_ai", "Automated test artifact: a fake notice, labelled exercise material.");
      }
      await p.click("#btnCommitAttack");
      r.check(tag + "the attack commits " + (ai ? "once it is filled in" : "with no AI box at all"), await until(async () => (await screenOn(p)) !== "screen-offense", 5000), await screenOn(p));
      // on to the other team's response
      for (let i = 0; i < 12 && (await screenOn(p)) !== "screen-defense"; i++) { await step(p); await p.waitForTimeout(150); }
      if ((await screenOn(p)) === "screen-defense") {
        await p.evaluate(() => { const b = document.getElementById("briefSheet"); if (b && !b.hidden) document.getElementById("btnBriefX").click(); });
        r.check(tag + "the defending team " + (ai ? "sees what was made with AI" : "is shown no AI panel"), (await p.isVisible("#theirArtifact")) === ai && (!ai || /made with AI/.test(await p.$eval("#theirArtifact", e => e.textContent))));
      } else r.fail(tag + "reached the defense screen", await screenOn(p));
      // reload: the flag survives a save
      await p.reload(); await p.click("#btnTitleGo"); await p.click("#btnResume"); await p.waitForTimeout(400);
      r.check(tag + "after a reload the game is still " + (ai ? "on" : "off") + " (page class and setting)", (await p.evaluate(() => G.requireAI)) === ai && (await p.evaluate(() => document.body.classList.contains("no-ai"))) === !ai);
      // play out the round and read the log
      for (let i = 0; i < 60 && (await screenOn(p)) !== "screen-over"; i++) { await step(p).catch(() => {}); await p.waitForTimeout(120); }
      r.check(tag + "the game reached the end", (await screenOn(p)) === "screen-over", await screenOn(p));
      const log = await p.evaluate(() => logHTML());
      r.check(tag + "the log " + (ai ? "records the AI artifact and the debrief asks about it" : "has no AI lines and the debrief doesn't ask about AI"),
        ai ? /AI artifact/.test(log) && /Look again at the AI artifacts/.test(log) : !/AI artifact/.test(log) && !/Look again at the AI/.test(log), log.match(/AI[^<]{0,60}/g) && log.match(/AI[^<]{0,60}/g).slice(0, 3).join(" | "));
      r.check(tag + "no JavaScript errors", g.errors.length === 0, g.errors.join("; "));
      await p.context().close();
    }
    // the setup checkbox is off by default, and the Rules follow it
    const ctx = await browser.newContext(), s = await ctx.newPage(); await s.goto(require("./helpers").PAGE); await s.click("#btnTitleGo");
    r.check("the setup checkbox is unticked by default, and the Rules already hide the AI", !(await s.isChecked("#optAI")) && await hidden(s, ".ai-only:not(.rf)"));
    await s.check("#optAI");
    r.check("ticking it shows the AI paragraphs of the Rules at once", await shown(s, ".ai-only:not(.rf)"));
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
