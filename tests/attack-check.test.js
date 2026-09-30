/*
  The attack form's check (build 21): each of the four boxes needs a full sentence, which the game takes to mean at
  least four words. Before build 21 only the first two boxes had to be filled and the last three together 30 characters.
  Tested on the check itself, then on the real Commit button so the message reaches the screen and nothing is sent.
*/
const { reporter, launch, PAGE } = require("./helpers");
(async () => {
  const r = reporter("Attack form: every box needs a full sentence");
  let browser;
  try {
    browser = await launch();
    const p = await (await browser.newContext()).newPage();
    const errs = []; p.on("pageerror", e => errs.push(e.message));
    await p.goto(PAGE);
    const ok = "The downtown polling place is hit.";
    const t = (o) => p.evaluate(o => { G = { requireAI: false }; return atkErr(Object.assign({ ai: "" }, o)); }, o);
    const full = { where: ok, what: ok, when: ok, goal: ok };
    r.check("four full sentences pass", (await t(full)) === null);
    for (const [k, msg] of [["where", /where this lands/], ["what", /what actually happens/], ["when", /when it happens/], ["goal", /trying to break/]]) {
      r.check("a box with one word fails: " + k, msg.test((await t({ ...full, [k]: "Downtown" })) || ""));
      r.check("an empty box fails: " + k, msg.test((await t({ ...full, [k]: "" })) || ""));
      r.check("three words fail, four pass: " + k, !!(await t({ ...full, [k]: "Hits one site" })) && (await t({ ...full, [k]: "Hits one site hard" })) === null);
    }
    r.check("long words in one box do not stand in for the others", !!(await t({ where: ok, what: "x".repeat(200), when: "y", goal: "z" })));
    r.check("extra spaces and line breaks are not counted as words", !!(await t({ ...full, when: "  a \n\n b   c  " })));
    r.check("no JavaScript errors", errs.length === 0, errs.join("; "));
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
