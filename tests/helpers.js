/* Shared pieces for the Ballotship tests. See README.md in this folder. */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
/* BALLOTSHIP_PAGE runs the tests against another copy of the page, e.g. the
   previous build, to show a bug before and after its fix. */
const PAGE = "file://" + (process.env.BALLOTSHIP_PAGE ? path.resolve(process.env.BALLOTSHIP_PAGE) : path.join(ROOT, "index.html"));

/* A tiny check/report helper, so every test prints the same PASS/FAIL lines. */
function reporter(title) {
  let failures = 0;
  console.log("\n" + title);
  return {
    check(name, ok, detail) {
      console.log((ok ? "  PASS  " : "  FAIL  ") + name + (detail && !ok ? "  (" + detail + ")" : ""));
      if (!ok) failures++;
      return ok;
    },
    fail(name, detail) { return this.check(name, false, detail); },
    get failures() { return failures; },
  };
}

/* Local relay from ../worker via `wrangler dev`. If RELAY_URL is set (the
   runner does this), reuse that one instead of starting another. */
async function withRelay(fn) {
  if (process.env.RELAY_URL) return fn(process.env.RELAY_URL);
  const port = 8790 + Math.floor(Math.random() * 100);
  const url = "http://127.0.0.1:" + port;
  const proc = spawn("npx", ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1"], {
    cwd: path.join(ROOT, "worker"), stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let log = "";
  proc.stdout.on("data", d => (log += d));
  proc.stderr.on("data", d => (log += d));
  try {
    const end = Date.now() + 90000;
    let up = false;
    while (!up && Date.now() < end) {
      try { up = (await fetch(url + "/")).ok; } catch (e) {}
      if (!up) await new Promise(r => setTimeout(r, 1000));
    }
    if (!up) throw new Error("local relay did not start:\n" + log.slice(-2000));
    return await fn(url);
  } finally {
    try { process.kill(-proc.pid); } catch (e) { proc.kill(); }
  }
}

/* Playwright's own Chromium; CHROMIUM_PATH points at another copy if needed. */
function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}).then(browser => {
    /* Build 12: a game fetches its injects from the inject library. Tests never touch the live library, so every
       screen they open gets the library switched off (the built-in deck), unless a test sets its own address
       (BALLOTSHIP_DECK_URL in the environment, or window.BALLOTSHIP_DECK_URL in an init script of its own). */
    const nc = browser.newContext.bind(browser);
    browser.newContext = async (o) => {
      const ctx = await nc(o);
      await ctx.addInitScript(u => { if (typeof window.BALLOTSHIP_DECK_URL !== "string") window.BALLOTSHIP_DECK_URL = u; }, process.env.BALLOTSHIP_DECK_URL || "");
      return ctx;
    };
    return browser;
  });
}

/* A local inject library (../injects) on its own port, with an empty store in a temporary folder and a known
   editing secret, so tests never touch a real one. fn(baseUrl, token). */
async function withInjects(fn) {
  const port = 8890 + Math.floor(Math.random() * 100);
  const url = "http://127.0.0.1:" + port, token = "test-secret-" + Math.floor(Math.random() * 1e9);
  const store = fs.mkdtempSync(path.join(require("os").tmpdir(), "ballotship-injects-"));
  const proc = spawn("npx", ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", store, "--var", "EDIT_TOKEN:" + token], {
    cwd: path.join(ROOT, "injects"), stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let log = "";
  proc.stdout.on("data", d => (log += d));
  proc.stderr.on("data", d => (log += d));
  try {
    const end = Date.now() + 90000;
    let up = false;
    while (!up && Date.now() < end) {
      try { up = (await fetch(url + "/")).ok; } catch (e) {}
      if (!up) await new Promise(r => setTimeout(r, 1000));
    }
    if (!up) throw new Error("local inject library did not start:\n" + log.slice(-2000));
    return await fn(url, token);
  } finally {
    try { process.kill(-proc.pid); } catch (e) { proc.kill(); }
    try { fs.rmSync(store, { recursive: true, force: true }); } catch (e) {}
  }
}

/* Open one screen per side on the setup page, simultaneous mode, relay on,
   random placement, no AI artifact required. Returns {pages, errors}. */
async function setupScreens(browser, relayUrl, sides, opts) {
  opts = opts || {};
  const room = "test-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const pages = {}, errors = [];
  for (const side of sides) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(ms => { window.BALLOTSHIP_POLL_MS = ms; }, opts.pollMs || 250);
    if (opts.deckUrls && opts.deckUrls[side] !== undefined) await ctx.addInitScript(u => { window.BALLOTSHIP_DECK_URL = u; }, opts.deckUrls[side]);   // build 12: which inject library this screen reads
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(side + ": " + e.message));
    pages[side] = p;
    await p.goto(PAGE);
    await p.getByText("Set up the exercise").first().click();
    await p.click("#modeSim");
    await p.click("#side" + side[0].toUpperCase() + side.slice(1));
    if (opts.rounds) await p.selectOption("#rounds", String(opts.rounds));
    if (!(await p.isChecked("#optOnline"))) await p.check("#optOnline");
    await p.fill("#relayUrl", relayUrl);
    await p.fill("#relayRoom", room);
    if (!(await p.isChecked("#optAuto"))) await p.check("#optAuto");
    if (await p.isChecked("#optAI")) await p.uncheck("#optAI");
    if (await p.isChecked("#optSfx")) await p.uncheck("#optSfx");
    if (await p.isChecked("#optChime")) await p.uncheck("#optChime");
    await p.click("#btnStart");
    await p.waitForTimeout(200);
  }
  return { pages, errors, room };
}

const screenOn = p => p.$eval(".screen.on", e => e.id).catch(() => "");
const threadHas = (p, text) => p.evaluate(t => JSON.stringify(G.thread).includes(t), text);

module.exports = { ROOT, PAGE, reporter, withRelay, withInjects, launch, setupScreens, screenOn, threadHas };
