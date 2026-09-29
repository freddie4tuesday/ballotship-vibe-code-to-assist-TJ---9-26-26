/*
  Quick mode: which tests does a change need? (`npm run quick`)

  The full suite plays real games in real browsers and takes about 4 minutes (it was about 35 while the
  tests polled too fast and waited on random ties). Quick mode is a shortcut for iterating, and runs:

    1. a SMOKE set, always: the fast checks that catch most breakage (about 2 minutes)
    2. plus the tests for whatever changed since the last FULL pass

  and nothing else. It is a time-saver for iterating, not a proof. `deploy.sh` accepts a
  quick pass for staging, but going live needs a full pass on the exact code (npm test).

  What "changed" means: files changed since the last full pass (git, including uncommitted
  and new files). index.html is one big file, so for it the change is judged from the names
  of the functions the edits sit in (git prints them in each change's header). If a change
  can't be tied to an area, quick mode falls back to the full-game test, which plays a whole
  game through the relay, rather than guessing it is harmless. If the shared test code or
  the relay changes, or there is no record of a full pass, it runs everything.
*/
const { spawnSync } = require("child_process");
const path = require("path");

const SMOKE = ["build-number", "release-process", "relay-api", "log-export", "poll-loops", "relay-three-screens", "quick-select"];

/* index.html: function-name pattern -> the tests that cover that area. */
const AREAS = [
  [/log|docx|zip|crc|xml|print|export|save(Blob)?$/i, ["log-export"]],
  [/aim|shot|footprint|gridEl|paint(Sa|Off)?Aim/i, ["shot-marks"]],
  [/endEarly|resumeEarly|EndSheet|snapshot|restore|resume|readSave|clearSave|judgeEnd|endGame|renderOver/i, ["end-early"]],
  [/relay|poll|route|mod(Read|Track)|renderMod|clock|chime|simStart|simCommit|simTake|simRoute/i, ["full-game", "poll-loops", "relay-three-screens"]],
  [/staging|IS_STAGING/i, ["release-process"]],
];

const EVERYTHING = { all: true };

/* changed: file names; contexts: function names from index.html's change headers. */
function select(changed, contexts) {
  const tests = new Set(SMOKE), why = [];
  const add = (names, reason) => { names.forEach(n => tests.add(n)); why.push(reason); };
  for (const f of changed) {
    if (/^tests\/(helpers|driver|run-all|quick)\.js$|^tests\/package(-lock)?\.json$/.test(f)) { if (f === "tests/quick.js") tests.add("quick-select"); else return { ...EVERYTHING, why: [f + " (shared test code) changed"] }; }
    else if (/^tests\/(.+)\.test\.js$/.test(f)) add([f.match(/^tests\/(.+)\.test\.js$/)[1]], f + " changed");
    else if (/^worker\//.test(f)) return { ...EVERYTHING, why: [f + " (the relay) changed"] };
    else if (/^(deploy\.sh|wrangler.*\.jsonc|\.assetsignore)$/.test(f)) add(["release-process"], f + " changed");
    else if (/\.md$/.test(f)) add(["build-number"], f + " changed");
    else if (/^demo\//.test(f)) why.push(f + " changed (no tests cover the demo)");
    else if (f === "index.html") {
      const hit = new Set();
      for (const c of contexts) for (const [re, names] of AREAS) if (re.test(c)) names.forEach(n => hit.add(n));
      if (hit.size) add([...hit], "index.html changed in: " + [...new Set(contexts)].slice(0, 6).join(", "));
      else add(["full-game"], "index.html changed somewhere not tied to a test area (" + [...new Set(contexts)].slice(0, 3).join(", ") + "), so a whole game is played");
    } else add(["full-game"], f + " changed and isn't recognised, so a whole game is played");
  }
  return { tests: [...tests], why };
}

function git(args) { const r = spawnSync("git", args, { cwd: path.join(__dirname, ".."), encoding: "utf8" }); return r.status === 0 ? r.stdout : null; }

/* Files changed since a commit, and the function names index.html's changes sit in. */
function changedSince(base) {
  const tracked = git(["diff", "--name-only", base]), fresh = git(["ls-files", "--others", "--exclude-standard"]);
  if (tracked === null || fresh === null) return null;
  const changed = [...new Set((tracked + fresh).split("\n").filter(Boolean))];
  const hunks = git(["diff", "-U0", base, "--", "index.html"]) || "";
  const contexts = [...hunks.matchAll(/^@@ [^@]* @@ ?(.*)$/gm)].map(m => m[1].trim()).filter(Boolean);
  return { changed, contexts };
}

module.exports = { select, changedSince, SMOKE };
