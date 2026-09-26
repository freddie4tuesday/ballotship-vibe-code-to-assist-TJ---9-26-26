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
  process.exit(failed.length ? 1 : 0);
})();
