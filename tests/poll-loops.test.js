/*
  One polling loop per screen, however often it is restarted (build 6).

  Each send restarts polling so the reply comes back quickly, and ending early or
  resuming restarts it too. A restart while a check was on its way used to leave
  the old loop running as well (found in build 6 when an early end left two loops
  per screen). This guards against loops piling up: it sends a burst of chat
  messages, then ends early and resumes, and counts one screen's relay checks
  over a quiet stretch. With one loop the count stays at the normal rate. Uses
  the game's real poll timing (no test speed-up).
*/
const { reporter, withRelay, launch, PAGE, screenOn } = require("./helpers");
const { setup } = require("./driver");

(async () => {
  const r = reporter("One relay polling loop per screen");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const room = "loops-" + Date.now();
      const a = await setup(browser, "sim", "t1", relay, room), b = await setup(browser, "sim", "t2", relay, room);
      for (const s of [a, b]) await s.p.evaluate(() => { window.BALLOTSHIP_POLL_MS = 0; });   // back to the real timing
      const polls = [];
      a.p.on("request", q => { if (/\/poll\?/.test(q.url())) polls.push(Date.now()); });
      // Open the relay panel (fast polling, every 1.5 s) and send a burst of messages.
      await a.p.$eval("#dockTab", e => { if (e.getAttribute("aria-expanded") !== "true") e.click(); });
      for (let i = 0; i < 12; i++) {
        await a.p.$eval("#msgText", (e, t) => { e.value = t; }, "burst message " + i);
        await a.p.$eval("#btnSendMsg", e => e.click());
        await a.p.waitForTimeout(120);
      }
      // End early from the other screen, then resume from this one.
      await b.p.$eval("#btnEndEarly", e => e.click()); await b.p.click("#btnEndNow");   // the target picker may be open over the top bar
      await a.p.waitForFunction(() => G.over, null, { timeout: 30000 });
      await a.p.$eval("#btnResumeGame", e => e.click());
      await b.p.waitForFunction(() => !G.over, null, { timeout: 30000 });
      await a.p.$eval("#dockTab", e => { if (e.getAttribute("aria-expanded") !== "true") e.click(); });
      await a.p.waitForTimeout(4000);
      const start = Date.now(); await a.p.waitForTimeout(15000);
      const n = polls.filter(t => t >= start).length;
      // One loop at 1.5 s is about 10 checks in 15 s; allow some slack for slow replies.
      r.check("after a burst of sends, one screen checks the relay at the normal rate (" + n + " checks in 15 s; one loop is about 10)", n <= 14, n + " checks");
      const busy = await a.p.$$eval(".relaystat,.dockstat", els => els.some(e => !e.hidden && /busy/.test(e.textContent)));
      r.check("the relay never says 'busy'", !busy);
      r.check("no JavaScript errors", a.errors.length + b.errors.length === 0, a.errors.concat(b.errors).join("; "));
    });
  } catch (e) { r.fail("test crashed", e.message); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
