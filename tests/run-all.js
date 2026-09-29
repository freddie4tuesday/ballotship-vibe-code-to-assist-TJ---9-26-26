/* Runs every *.test.js in this folder, sharing one local relay. `npm test` */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { withRelay } = require("./helpers");

const files = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
(async () => {
  const failed = [];
  await withRelay(async relay => {
    for (const f of files) {
      const res = spawnSync(process.execPath, [path.join(__dirname, f)], {
        stdio: "inherit", env: { ...process.env, RELAY_URL: relay },
      });
      if (res.status !== 0) failed.push(f);
    }
  });
  console.log("\n" + (failed.length ? "FAILED: " + failed.join(", ") : "All " + files.length + " test files passed."));
  // Leave a fingerprint of the code that just passed, so ../deploy.sh can refuse to
  // release anything the tests haven't seen. Same format as `sha256sum index.html worker/src/index.js`.
  if (!failed.length) {
    const crypto = require("crypto"), root = path.join(__dirname, "..");
    fs.writeFileSync(path.join(__dirname, ".last-pass"), ["index.html", "worker/src/index.js"].map(f =>
      crypto.createHash("sha256").update(fs.readFileSync(path.join(root, f))).digest("hex") + "  " + f + "\n").join(""));
  }
  process.exit(failed.length ? 1 : 0);
})();
