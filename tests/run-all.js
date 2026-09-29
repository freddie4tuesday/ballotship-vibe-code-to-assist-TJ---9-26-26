/*
  Runs the Ballotship tests, sharing one local relay.

    npm test            the FULL suite, about 4 minutes. Needed before going live.
    npm run quick       QUICK mode: the smoke set plus the tests for what changed since the
                        last full pass (see quick.js), about 2 minutes. Enough for staging.

  A passing full run leaves tests/.last-pass (a fingerprint of index.html and the relay) and
  tests/.last-pass-commit; a passing quick run leaves tests/.last-quick. ../deploy.sh reads
  them: staging accepts either, live accepts only a full pass.
*/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { withRelay } = require("./helpers");
const { select, changedSince } = require("./quick");

const ROOT = path.join(__dirname, "..");
const quick = process.argv.includes("--quick");
const all = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
const short = f => f.replace(/\.test\.js$/, "");
const fingerprint = () => ["index.html", "worker/src/index.js"].map(f =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex") + "  " + f + "\n").join("");   // same as `sha256sum index.html worker/src/index.js`
const read = f => { try { return fs.readFileSync(path.join(__dirname, f), "utf8").trim(); } catch (e) { return null; } };

let files = all;
if (quick) {
  const base = read(".last-pass-commit"), diff = base && changedSince(base);
  if (!diff) {
    console.log("QUICK MODE: there is no usable record of a full pass" + (base ? " (commit " + base.slice(0, 8) + " isn't in this repo)" : "") + ", so everything runs.\n");
  } else {
    const sel = select(diff.changed, diff.contexts);
    files = sel.all ? all : all.filter(f => sel.tests.includes(short(f)));
    console.log("QUICK MODE. Changed since the last full pass (" + base.slice(0, 8) + "): " + (diff.changed.length ? diff.changed.join(", ") : "nothing") + ".");
    sel.why.forEach(w => console.log("  - " + w));
    console.log("Running " + files.length + " of " + all.length + ": " + files.map(short).join(", "));
    if (!sel.all) console.log("Skipping: " + (all.filter(f => !files.includes(f)).map(short).join(", ") || "nothing") + ". Run the full suite before going live.\n");
    else console.log("");
  }
}

(async () => {
  const failed = [], times = [], t0 = Date.now();
  await withRelay(async relay => {
    for (const f of files) {
      const t = Date.now();
      const res = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", env: { ...process.env, RELAY_URL: relay } });
      times.push([short(f), Math.round((Date.now() - t) / 1000)]);
      if (res.status !== 0) failed.push(f);
    }
  });
  const full = files.length === all.length;
  console.log("\nTimes: " + times.map(([n, s]) => n + " " + s + "s").join(", ") + ". Total " + Math.round((Date.now() - t0) / 60000 * 10) / 10 + " minutes.");
  console.log(failed.length ? "FAILED: " + failed.join(", ") : "All " + files.length + " test files passed" + (quick && !full ? " (quick mode: " + (all.length - files.length) + " skipped; go-live needs the full suite)." : "."));
  if (!failed.length) {
    // Fingerprints, so ../deploy.sh can refuse to release code the tests haven't seen.
    if (!quick || full) {
      fs.writeFileSync(path.join(__dirname, ".last-pass"), fingerprint());
      const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
      if (head.status === 0) fs.writeFileSync(path.join(__dirname, ".last-pass-commit"), head.stdout.trim() + "\n");
    }
    fs.writeFileSync(path.join(__dirname, ".last-quick"), fingerprint());
  }
  process.exit(failed.length ? 1 : 0);
})();
