/*
  The clock when one laptop is passed, or two screens take turns (build 11, an option).

  Checks the setup option, and then, with 4-second clocks so it runs fast, that:
    - it is off by default: no clock, nothing commits by itself
    - the clock is hidden during the hand-over and starts when the team's writing screen opens
    - at zero, what is written is committed (and a random target is chosen if none was), for the
      attack, the response, and the crisis screen, without logging anything twice
    - Pause really pauses; a reload brings the clock back paused, not restarted
    - with two screens taking turns, the attack clock runs on the attacker's screen and the
      response clock starts on the defender's only once the attack has arrived
*/
const { reporter, withRelay, launch, screenOn } = require("./helpers");
const { setup, setVals, TEXT } = require("./driver");

const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
const clockState = p => p.evaluate(() => ({ shown: !document.getElementById("clockBox").hidden, label: document.getElementById("clkLab").textContent,
  phase: G.clock && G.clock.phase, key: G.clock && G.clock.key, running: G.clock && G.clock.running, done: !!(G.clock && G.clock.done), left: G.clock ? clockLeft() : null }));
const click = (p, sel) => p.$eval(sel, e => e.click());
const on = (p, id) => screenOn(p).then(s => s === id);

(async () => {
  const r = reporter("Clock for one laptop and for two screens taking turns");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const extra = [];
      // ---- the setup screen ----
      {
        const ctx = await browser.newContext(), p = await ctx.newPage(); extra.push(ctx);
        await p.goto("file://" + require("path").resolve(__dirname, "..", "index.html")); await p.click("#btnTitleGo");
        const ui = async m => { await p.click(m); return p.evaluate(() => ({ opt: !document.getElementById("clockOpt").hidden, times: !document.getElementById("simTimes").hidden, on: document.getElementById("optClock").checked })); };
        let u = await ui("#modeSim");
        r.check("simultaneous: no 'Use a clock' choice (it always has one), times shown", !u.opt && u.times, JSON.stringify(u));
        u = await ui("#modePass");
        r.check("one laptop: 'Use a clock' is offered, off, and the times are hidden", u.opt && !u.on && !u.times, JSON.stringify(u));
        await p.check("#optClock");
        u = await ui("#modePass");
        r.check("...ticking it shows the times", u.times && u.on, JSON.stringify(u));
        r.check("the times default to 10:00 and 10:00", (await p.inputValue("#durA")) === "10:00" && (await p.inputValue("#durD")) === "10:00");
        u = await ui("#modeRelay");
        r.check("two screens taking turns: offered too", u.opt);
      }

      // ---- off by default ----
      {
        const g = await setup(browser, "pass", null, null, null, { rounds: 4 }); extra.push(g.p.context());
        await click(g.p, "#btnGate"); await g.p.waitForTimeout(6000);
        const c = await clockState(g.p);
        r.check("clock off (the default): nothing is shown, and 6 s later nothing has committed", !c.shown && c.phase === null && (await on(g.p, "screen-offense")), JSON.stringify(c));
      }

      // ---- one laptop, 4-second clocks ----
      const P = await setup(browser, "pass", null, null, null, { rounds: 4, clock: { a: "0:04", d: "0:04" } }), p = P.p; extra.push(p.context());
      let c = await clockState(p);
      r.check("on the hand-over screen the clock is hidden and hasn't started", (await on(p, "screen-gate")) && !c.shown && c.phase === null, JSON.stringify(c));
      await click(p, "#btnGate");
      c = await clockState(p);
      r.check("when the team presses 'We have the laptop' the attack clock starts, running", c.shown && c.phase === "attack" && c.running && c.left > 2.5 && c.left <= 4, JSON.stringify(c));
      r.check("...and is labelled Attack", /Attack/.test(c.label), c.label);
      // nothing written, no target picked: time runs out
      r.check("at zero the attack commits and the laptop goes to the other team", await until(() => on(p, "screen-gate"), 9000));
      const a1 = await p.evaluate(() => ({ desc: G.pending.attackDesc, auto: !!G.pending.autoTarget, cells: G.pending.cells.length, thread: G.thread.map(m => m.text).join("\n") }));
      r.check("...nothing written is recorded as such, with a random target chosen", a1.desc === "(nothing written before time)" && a1.auto && a1.cells > 0, JSON.stringify(a1));
      r.check("...and the log says the shot was random", /No target chosen before time\. Fired at random\./.test(a1.thread));
      c = await clockState(p);
      r.check("the clock is hidden again during the second hand-over", !c.shown && c.done, JSON.stringify(c));
      await click(p, "#btnGate");
      c = await clockState(p);
      r.check("the response clock starts when the defending team's screen opens", c.shown && c.phase === "defense" && c.running && /Response/.test(c.label), JSON.stringify(c));
      r.check("at zero the response commits and the result appears", await until(() => on(p, "screen-resolve"), 9000));
      const d1 = await p.evaluate(() => ({ desc: G.pending.defDesc, responses: G.thread.filter(m => m.kind === "response").length }));
      r.check("...recorded as nothing written before time, logged once", d1.desc === "(nothing written before time)" && d1.responses === 1, JSON.stringify(d1));

      // second turn: written words and a chosen target are kept
      await click(p, "#btnEndTurn");
      await click(p, "#btnGate");
      await until(() => p.isVisible("#aimSheet"), 5000);
      await p.click("#aimGrid button.cell.pick >> nth=7"); await p.click("#btnAimOk");
      const chosen = await p.evaluate(() => G.pending.origin);
      await setVals(p, "#screen-offense textarea, #screen-offense input[type=text]");
      await until(() => on(p, "screen-gate"), 9000);
      const a2 = await p.evaluate(() => ({ desc: G.pending.attackDesc, auto: !!G.pending.autoTarget, origin: G.pending.origin }));
      r.check("if a team has written something and picked a target, time running out commits exactly that", a2.desc.includes(TEXT) && !a2.auto && a2.origin === chosen, JSON.stringify(a2) + " chosen " + chosen);

      // pause really pauses
      await click(p, "#btnGate"); await p.waitForTimeout(500);
      await click(p, "#btnClkGo");                                  // Pause
      await p.waitForTimeout(6000);
      c = await clockState(p);
      r.check("Pause holds the clock: 6 s later (longer than the 4 s limit) nothing has committed", !c.running && c.left > 2 && (await on(p, "screen-defense")) , JSON.stringify(c) + " " + await screenOn(p));
      await click(p, "#btnClkGo");                                  // Start again
      r.check("...and Start lets it run out and commit", await until(() => on(p, "screen-resolve"), 9000));

      // ---- a crisis inject ----
      {
        const g = await setup(browser, "pass", null, null, null, { rounds: 1, clock: { a: "0:04", d: "0:05" } }); extra.push(g.p.context());
        const q = g.p;
        await q.evaluate(() => { DECK_START = 3; });                // the third inject is a jurisdiction-wide crisis
        await click(q, "#btnGate");
        r.check("crisis: the attack clock runs out with no target to pick, and commits", await until(() => on(q, "screen-gate"), 9000));
        await click(q, "#btnGate");
        await setVals(q, "#screen-defense textarea, #screen-defense input[type=text]");
        await click(q, "#btnCommitDefense");
        r.check("crisis: after the response is written the crisis screen follows, with the clock still running", (await on(q, "screen-crisis")) && (await clockState(q)).running);
        r.check("crisis: at zero the first cells still up are chosen and play moves on", await until(() => on(q, "screen-resolve"), 9000));
        const k = await q.evaluate(() => ({ down: G.teams[G.pending.defKey].cellsDown, stmt: G.pending.statement, responses: G.thread.filter(m => m.kind === "response").length }));
        r.check("crisis: two cells went down, the statement says nothing was written, and the response is logged once", k.down === 2 && k.stmt === "(nothing written before time)" && k.responses === 1, JSON.stringify(k));
      }

      // ---- reload brings the clock back paused, not restarted ----
      {
        const g = await setup(browser, "pass", null, null, null, { rounds: 1, clock: { a: "0:30", d: "0:30" } }); extra.push(g.p.context());
        const q = g.p;
        await click(q, "#btnGate"); await q.waitForTimeout(3500);
        const before = await clockState(q);
        await q.reload();
        const panel = (await q.isVisible("#resumePanel")) || (await q.click("#btnTitleGo").then(() => q.isVisible("#resumePanel")).catch(() => false));
        if (panel) await q.click("#btnResume");
        await q.waitForTimeout(800);
        const after = await clockState(q);
        r.check("reload: the game offers itself back and returns to the writing screen", panel && (await on(q, "screen-offense")));
        r.check("reload: the clock comes back paused with about the same time left, not restarted at 30", !after.running && after.key === before.key && Math.abs(after.left - before.left) < 2 && after.left < 29, JSON.stringify({ before, after }));
      }

      // ---- two screens taking turns ----
      {
        const room = "turnclk-" + Date.now(), o = { rounds: 1, clock: { a: "0:04", d: "0:04" }, pollMs: 700 };
        const a = await setup(browser, "relay", "t1", relay, room, o), b = await setup(browser, "relay", "t2", relay, room, o); extra.push(a.p.context(), b.p.context());
        await until(() => on(a.p, "screen-offense"), 15000);
        const ca = await clockState(a.p), cb0 = await clockState(b.p);
        r.check("taking turns: the attacker's screen runs the attack clock; the waiting screen shows none", ca.shown && ca.phase === "attack" && ca.running && !cb0.shown && cb0.phase === null, JSON.stringify([ca, cb0]));
        r.check("taking turns: at zero the attack commits and reaches the defender, whose screen opens on the defense", await until(() => on(b.p, "screen-defense"), 20000));
        const cb = await clockState(b.p);
        r.check("taking turns: the response clock starts on the defender's screen only once the attack has arrived", cb.shown && cb.phase === "defense" && cb.running && cb.left > 2 && cb.left <= 4, JSON.stringify(cb));
        r.check("taking turns: the attacker's clock is hidden while it waits", !(await clockState(a.p)).shown);
        r.check("taking turns: at zero the response commits on the defender's screen", await until(() => on(b.p, "screen-resolve"), 12000));
        const dd = await b.p.evaluate(() => G.pending.defDesc), aa = await b.p.evaluate(() => G.pending.attackDesc);
        r.check("...with the attack and response both recorded as written (here, nothing)", dd === "(nothing written before time)" && aa === "(nothing written before time)", aa + " / " + dd);
        r.check("no JavaScript errors", a.errors.concat(b.errors).length === 0, a.errors.concat(b.errors).join("; "));
      }
      r.check("no JavaScript errors (one laptop)", P.errors.length === 0, P.errors.join("; "));
    });
  } catch (e) { r.fail("test crashed", e.message); console.log(e.stack); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
