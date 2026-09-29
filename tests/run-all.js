/*
  Runs every Ballotship test, sharing one local relay. `npm test` (about 4 minutes).

  A passing run leaves tests/.last-pass, a fingerprint of index.html and the relay, so that
  ../deploy.sh can refuse to release code the tests haven't passed on.
*/
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { withRelay } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
const fingerprint = () => ["index.html", "worker/src/index.js"].map(f =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, f))).digest("hex") + "  " + f + "\n").join("");   // same as `sha256sum index.html worker/src/index.js`

(async () => {
  const failed = [], times = [], t0 = Date.now();
  await withRelay(async relay => {
    for (const f of files) {
      const t = Date.now();
      const res = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", env: { ...process.env, RELAY_URL: relay } });
      times.push([f.replace(/\.test\.js$/, ""), Math.round((Date.now() - t) / 1000)]);
      if (res.status !== 0) failed.push(f);
    }
  });
  console.log("\nTimes: " + times.map(([n, s]) => n + " " + s + "s").join(", ") + ". Total " + Math.round((Date.now() - t0) / 6000) / 10 + " minutes.");
  console.log(failed.length ? "FAILED: " + failed.join(", ") : "All " + files.length + " test files passed.");
  if (!failed.length) fs.writeFileSync(path.join(__dirname, ".last-pass"), fingerprint());
  process.exit(failed.length ? 1 : 0);
})();
