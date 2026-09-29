/*
  The build number lives in three places that must agree: the newest entry in
  the build log at the top of index.html, the footer, and "Current version" in
  ballotship-SUMMARY.md. This catches a build that forgot one of them.
  Also checks the page loads with no errors and shows that number on screen.
*/
const fs = require("fs");
const path = require("path");
const { ROOT, PAGE, reporter, launch } = require("./helpers");

(async () => {
  const r = reporter("Build number and page load");
  let browser;
  try {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const summary = fs.readFileSync(path.join(ROOT, "ballotship-SUMMARY.md"), "utf8");
    const header = html.slice(0, html.indexOf("-->"));
    const logged = [...header.matchAll(/^\s+build (\d+)\s/gm)].map(m => +m[1]);
    const newest = Math.max(...logged);
    const footer = +((html.match(/<span class="tag">build (\d+)<\/span>/) || [])[1]);
    const current = +((summary.match(/\*\*Current version:\*\* build (\d+)/) || [])[1]);
    r.check("build log entries run 1, 2, 3... with no gaps", logged.every((n, i) => n === i + 1), logged.join(","));
    r.check("footer matches the newest build log entry", footer === newest, "footer " + footer + ", log " + newest);
    r.check("summary's current version matches", current === newest, "summary " + current + ", log " + newest);

    browser = await launch();
    const p = await browser.newPage();
    const errors = [];
    p.on("pageerror", e => errors.push(e.message));
    await p.goto(PAGE);
    await p.waitForTimeout(500);
    const ver = await p.evaluate(() => APP_VERSION);
    r.check("footer on screen (a saved copy counts as live) shows the version, not the build: version " + ver, (await p.textContent(".build-footer .tag")) === "version " + ver && /^\d+\.\d+$/.test(ver));
    r.check("...while the page's own footer HTML still holds build " + newest + " for the release script", footer === newest);
    r.check("Ready for Tuesday branding is present", /Ready for Tuesday/.test(await p.textContent("#titleFoot")));
    // The moderator panel's clock note (build 10): it used to say the clock was "advisory" while also saying time
    // running out commits what's written. Wording is Ready for Tuesday's, so it only changes on approval.
    const panel = await p.$eval("#screen-mod", e => e.textContent.replace(/\s+/g, " "));
    r.check("the moderator's clock note no longer calls the clock advisory", !/advisory/i.test(panel), panel.match(/[^.]*advisory[^.]*\./i) || "");
    r.check("...and says what really happens when a team's clock runs out", /If a team's clock runs out, what it has written is committed as it stands and the round moves on\./.test(panel));
    // Setup screen (build 6).
    await p.click("#btnTitleGo");
    const last = await p.$eval("#rounds", e => { const o = e.options[e.options.length - 1]; return o.value + "|" + o.textContent; });
    r.check("the last round choice is 1 round, for testing", last === "1|1 round (for testing purposes)", last);
    await p.click("#modeSim");
    await p.click("#sideMod");
    r.check("there is no relay checkbox; choosing Moderator shows the host hint (the moderator sets up)", (await p.$("#optOnline")) === null && (await p.isVisible("#hostHint")));
    r.check("the page loads with no JavaScript errors", errors.length === 0, errors.join("; "));
  } catch (e) {
    r.fail("test crashed", e.message);
  } finally {
    if (browser) await browser.close();
  }
  process.exit(r.failures ? 1 : 0);
})();
