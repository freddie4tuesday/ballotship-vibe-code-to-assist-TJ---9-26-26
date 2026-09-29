/*
  The release process (build 9): staging first, live second.

  Part 1 - the page knows where it is. Served at the staging address, at the live
  address, and as a plain file (each fetched from the local index.html, no network):
    - staging says STAGING (tab title, footer tag, title screen) and defaults to the
      staging relay; live and a saved file don't, and default to the live relay
    - a game started on staging isn't offered for resume on the live address, so
      staging can never overwrite a real saved game
  Part 2 - deploy.sh won't let the order be skipped. It's run with a fake token, so it
  can't reach Cloudflare; every case below must be refused before anything is deployed.
*/
const fs = require("fs"), path = require("path");
const { spawnSync } = require("child_process");
const { reporter, launch, ROOT } = require("./helpers");

const STAGING = "https://ballotship-staging.electionadminsuite.com/";
const LIVE = "https://ballotship.electionadminsuite.com/";
const R_STAGING = "https://ballotship-relay-staging.electionadminsuite.com", R_LIVE = "https://ballotship-relay.electionadminsuite.com";

(async () => {
  const r = reporter("Release process: staging awareness and the deploy script");
  let browser;
  try {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    browser = await launch();
    const ctx = await browser.newContext();
    await ctx.route(/fonts\.|readyfortuesday/, x => x.abort());                 // the sandbox can't reach these anyway
    await ctx.route(/electionadminsuite\.com\/?(\?.*)?$/, x => x.fulfill({ status: 200, contentType: "text/html", body: html }));
    const errors = [];
    const open = async url => { const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message)); await p.goto(url); await p.waitForTimeout(300); return p; };
    const facts = p => p.evaluate(() => ({
      title: document.title, tags: [...document.querySelectorAll(".build-footer .tag")].map(t => t.textContent),
      foot: document.getElementById("titleFoot").textContent, relay: document.getElementById("relayUrl").value,
      placeholder: document.getElementById("relayUrl").placeholder, resume: !document.getElementById("resumePanel").hidden }));

    const s = await open(STAGING), sf = await facts(s);
    r.check("staging: the browser tab says [STAGING]", /^\[STAGING\] /.test(sf.title), sf.title);
    r.check("staging: the footer starts with a STAGING tag, then the build number", sf.tags.length === 2 && sf.tags[0] === "STAGING" && /^build \d+$/.test(sf.tags[1]), sf.tags.join(" | "));
    r.check("staging: the title screen says STAGING", /STAGING/.test(sf.foot) && /Ready for Tuesday/.test(sf.foot), sf.foot);
    r.check("staging: the relay defaults to the staging relay", sf.relay === R_STAGING && sf.placeholder === R_STAGING, sf.relay);

    const l = await open(LIVE), lf = await facts(l);
    r.check("live: no STAGING anywhere", !/STAGING/i.test(lf.title + lf.tags.join("") + lf.foot), JSON.stringify(lf));
    r.check("live: one footer tag, a version number (no build number)", lf.tags.length === 1 && /^version \d+\.\d+$/.test(lf.tags[0]), lf.tags.join(" | "));
    r.check("live: the relay defaults to the live relay", lf.relay === R_LIVE && lf.placeholder === R_LIVE, lf.relay);

    // Build 12: which inject library each address reads. (Tests switch the library off with an override; take it away to ask.)
    const lib = p => p.evaluate(() => { delete window.BALLOTSHIP_DECK_URL; return deckUrl(); });
    r.check("staging reads the STAGING inject library", (await lib(s)) === "https://ballotship-injects-staging.electionadminsuite.com/api/deck", await lib(s));
    r.check("live reads the LIVE inject library", (await lib(l)) === "https://ballotship-injects.electionadminsuite.com/api/deck", await lib(l));
    const jc = f => fs.readFileSync(path.join(ROOT, "injects", f), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const liveCfg = jc("wrangler.jsonc"), stgCfg = jc("wrangler.staging.jsonc");
    r.check("the two inject libraries are separate Workers with separate stores and their own addresses",
      /"name": "ballotship-injects"/.test(liveCfg) && /"name": "ballotship-injects-staging"/.test(stgCfg) &&
      /ballotship-injects\.electionadminsuite\.com\/\*/.test(liveCfg) && /ballotship-injects-staging\.electionadminsuite\.com\/\*/.test(stgCfg) &&
      !/injects-staging/.test(liveCfg) && !/"pattern": "ballotship-injects\./.test(stgCfg));
    r.check("the inject library is kept off the game's site (a saved deck or the editor page is never served from it)", /^injects$/m.test(fs.readFileSync(path.join(ROOT, ".assetsignore"), "utf8")));
    const f = await ctx.newPage(); await f.goto("file://" + path.join(ROOT, "index.html")); await f.waitForTimeout(300);
    const ff = await facts(f);
    r.check("a saved copy of the file behaves as live (version footer too)", !/STAGING/i.test(ff.title + ff.foot) && ff.relay === R_LIVE && ff.tags.length === 1 && /^version \d+\.\d+$/.test(ff.tags[0]), JSON.stringify(ff));

    // Start a game on staging; the live address must not see it.
    await s.click("#btnTitleGo"); await s.click("#modePass");
    if (!(await s.isChecked("#optAuto"))) await s.check("#optAuto");
    await s.fill("#jurisdiction", "Test County"); await s.click("#btnStart"); await s.waitForTimeout(500);
    const saved = await s.evaluate(() => !!localStorage.getItem("ballotship:save"));
    const l2 = await open(LIVE), lf2 = await facts(l2);
    r.check("a game started on staging is saved there...", saved);
    r.check("...and the live address is not offered it to resume", lf2.resume === false);
    const s2 = await open(STAGING);
    r.check("...while staging itself is", (await facts(s2)).resume === true);
    r.check("no JavaScript errors", errors.length === 0, errors.join("; "));

    // deploy.sh refusals (fake token: nothing can be deployed; each case is stopped before wrangler runs).
    const run = (args, env) => spawnSync("bash", [path.join(ROOT, "deploy.sh"), ...args], { cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
    const branch = spawnSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
    const say = x => (x.stdout + x.stderr).replace(/\s+/g, " ").trim();
    let x = run([]);
    r.check("deploy.sh with no target explains its usage", x.status !== 0 && /usage: .*staging\|production/.test(say(x)), say(x));
    x = run(["staging"], {});
    r.check("deploy.sh without a Cloudflare token stops", x.status !== 0 && /CLOUDFLARE_API_TOKEN/.test(say(x)), say(x));
    if (branch !== "main") {
      x = run(["production"], { CLOUDFLARE_API_TOKEN: "not-a-real-token" });
      r.check("deploy.sh production refuses to run from '" + branch + "' (live comes only from main)", x.status !== 0 && /deploys from the 'main' branch/.test(say(x)), say(x));
    }
    if (branch !== "staging") {
      x = run(["staging"], { CLOUDFLARE_API_TOKEN: "not-a-real-token" });
      r.check("deploy.sh staging refuses to run from '" + branch + "' (staging comes only from staging)", x.status !== 0 && /deploys from the 'staging' branch/.test(say(x)), say(x));
    }
    r.check("deploy.sh and the staging configs are kept off the live site", /deploy\.sh/.test(fs.readFileSync(path.join(ROOT, ".assetsignore"), "utf8")) && /wrangler\.staging\.jsonc/.test(fs.readFileSync(path.join(ROOT, ".assetsignore"), "utf8")));
  } catch (e) { r.fail("test crashed", e.message); console.log(e.stack); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
