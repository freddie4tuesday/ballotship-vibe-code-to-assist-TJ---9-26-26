/*
  Ballotship — three-screen relay test (first written for build 3).

  Starts a local copy of the relay (../worker, via `wrangler dev`), opens three
  separate browser screens on ../index.html — team 1, team 2 and the moderator —
  in simultaneous mode with the automatic relay on, and checks:

    1. all three screens start on the right screen
    2. both teams commit an attack, and each attack crosses the relay and
       lands on the other team's defense screen
    3. a chat message from team 1 reaches team 2 and the moderator
    4. after 30 idle minutes (simulated) a screen stops polling, a message sent
       meanwhile is not picked up, and one click catches up on it
    5. no JavaScript errors on any screen

  Nothing touches the live relay or the live site.
  Run with the rest of the suite: see README.md in this folder.

  This is a starting point, not full coverage. It plays one round, not a
  whole game. If TJ's original test suite turns up (see ROADMAP.md), prefer it.
*/
const { reporter, withRelay, launch, setupScreens, screenOn, threadHas } = require("./helpers");

(async () => {
  const r = reporter("Three screens, one round, chat and idle pause (through the relay)");
  const check = r.check.bind(r);
  let browser;
  try {
    await withRelay(async RELAY => {
    browser = await launch();
    const { pages, errors } = await setupScreens(browser, RELAY, ["t1", "t2", "mod"]);
    check("team 1 starts on the attack screen", (await screenOn(pages.t1)) === "screen-sim-attack");
    check("team 2 starts on the attack screen", (await screenOn(pages.t2)) === "screen-sim-attack");
    check("moderator starts on the moderator screen", (await screenOn(pages.mod)) === "screen-mod");

    for (const side of ["t1", "t2"]) {
      const p = pages[side];
      // The target picker opens on its own at round start.
      if (!(await p.isVisible("#aimSheet"))) { const aim = await p.$("#saAim button"); if (aim) await aim.click(); }
      if (await p.isVisible("#aimSheet")) {
        await p.click("#aimGrid button.cell.pick >> nth=7");
        await p.click("#btnAimOk");
      }
      for (const f of ["sa_where", "sa_what", "sa_goal"]) await p.fill("#" + f, side + " " + f + " text");
      await p.fill("#sa_when", side + " timing");
      await p.click("#btnSaCommit");
      await p.waitForTimeout(300);
      const err = await p.$eval("#saErr", e => (e.hidden ? "" : e.textContent));
      check(side + " commits its attack", !err, err);
    }
    await pages.t1.waitForTimeout(2000);
    for (const [me, them] of [["t1", "t2"], ["t2", "t1"]]) {
      check(me + " moves to the defense screen", (await screenOn(pages[me])) === "screen-sim-defense");
      const txt = await pages[me].$eval("#sdAttack", e => e.textContent).catch(() => "");
      check(me + " received " + them + "'s attack through the relay", txt.includes(them + " sa_where text"));
    }

    const sendChat = async (p, text) => {
      await p.$eval("#dockTab", e => { if (e.getAttribute("aria-expanded") !== "true") e.click(); });
      await p.$eval("#msgText", (e, t) => { e.value = t; }, text);
      await p.$eval("#btnSendMsg", e => e.click());
    };
    await sendChat(pages.t1, "hello from team 1 via relay");
    await pages.t2.waitForTimeout(2000);
    check("chat reaches team 2", await threadHas(pages.t2, "hello from team 1 via relay"));
    check("chat reaches the moderator", await threadHas(pages.mod, "hello from team 1 via relay"));

    const p2 = pages.t2;
    await p2.evaluate(() => { lastActivity = Date.now() - 31 * 60 * 1000; });
    await p2.waitForTimeout(1500);
    check("polling pauses after 30 idle minutes", await p2.evaluate(() => pollPaused));
    await sendChat(pages.t1, "sent while team 2 was paused");
    await p2.waitForTimeout(1500);
    check("a paused screen does not poll", !(await threadHas(p2, "sent while team 2 was paused")));
    await p2.mouse.click(5, 5);
    await p2.waitForTimeout(1500);
    check("one click resumes polling", !(await p2.evaluate(() => pollPaused)));
    check("and catches up on the missed message", await threadHas(p2, "sent while team 2 was paused"));

    check("no JavaScript errors on any screen", errors.length === 0, errors.join("; "));
    });
  } catch (e) {
    r.fail("test crashed", e.message);
  } finally {
    if (browser) await browser.close();
  }
  process.exit(r.failures ? 1 : 0);
})();
