/*
  Quick mode picks the right tests (see quick.js). Pure logic, no browser, a few seconds.
  If quick mode ever skipped a test it should have run, this is where it would show.
*/
const { reporter } = require("./helpers");
const { select, SMOKE } = require("./quick");

const r = reporter("Quick mode picks the right tests");
const has = (sel, ...names) => !sel.all && names.every(n => sel.tests.includes(n));
const lacks = (sel, ...names) => !sel.all && names.every(n => !sel.tests.includes(n));

let s = select(["ROADMAP.md"], []);
r.check("a docs-only change runs the smoke set and nothing slow", has(s, ...SMOKE) && lacks(s, "end-early", "shot-marks", "full-game"), JSON.stringify(s.tests));
s = select(["worker/src/index.js"], []);
r.check("a relay change runs everything", s.all === true);
s = select(["tests/helpers.js"], []);
r.check("a change to shared test code runs everything", s.all === true);
s = select(["tests/driver.js"], []);
r.check("...including the game driver", s.all === true);
s = select(["index.html"], ["function logHTML() {"]);
r.check("a change inside the log code adds the log test, not the slow game tests", has(s, "log-export") && lacks(s, "end-early", "shot-marks"), JSON.stringify(s.tests));
s = select(["index.html"], ["function endEarly(fromRemote) {"]);
r.check("a change inside end-early adds the end-early test", has(s, "end-early"));
s = select(["index.html"], ["function paintAim() {"]);
r.check("a change inside the target picker adds the shot-marks test", has(s, "shot-marks"));
s = select(["index.html"], ["function modReadResult(from, parts) {"]);
r.check("a change in the moderator code adds the game and relay tests", has(s, "full-game", "poll-loops", "relay-three-screens"));
s = select(["index.html"], ["html,body{margin:0;padding:0}"]);
r.check("a change not tied to any area plays a whole game rather than guess", has(s, "full-game"), JSON.stringify(s.tests));
s = select(["index.html"], []);
r.check("...and so does one with no context at all", has(s, "full-game"));
s = select(["something-new.txt"], []);
r.check("an unrecognised file plays a whole game too", has(s, "full-game"));
s = select(["deploy.sh"], []);
r.check("a change to the deploy script adds the release-process test", has(s, "release-process"));
s = select(["tests/end-early.test.js"], []);
r.check("a changed test runs itself", has(s, "end-early"));
s = select(["demo/record-demo.js"], []);
r.check("demo changes add nothing, and say so", lacks(s, "full-game") && s.why.some(x => /no tests cover the demo/.test(x)));
s = select([], []);
r.check("with nothing changed, the smoke set still runs", has(s, ...SMOKE));
r.check("every smoke test exists", SMOKE.every(n => require("fs").existsSync(require("path").join(__dirname, n + ".test.js"))));
console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
process.exit(r.failures ? 1 : 0);
