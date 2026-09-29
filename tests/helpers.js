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
async function withRelay(fn, opts) {
  opts = opts || {};   // opts.fresh: always start a relay of its own; opts.vars: settings for it (e.g. ROOM_TTL_SECONDS)
  if (process.env.RELAY_URL && !opts.fresh) return fn(process.env.RELAY_URL);
  const port = 8790 + Math.floor(Math.random() * 100);
  const url = "http://127.0.0.1:" + port;
  const args = ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1"];
  if (opts.fresh) args.push("--persist-to", fs.mkdtempSync(path.join(require("os").tmpdir(), "ballotship-relay-")));
  Object.keys(opts.vars || {}).forEach(k => args.push("--var", k + ":" + opts.vars[k]));
  const proc = spawn("npx", args, {
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

/* A local inject library (../injects) on its own port, with an empty store in a temporary folder, so tests never
   touch a real one, and a stand-in for Resend that keeps every sign-in email instead of sending it (build 15).
   fn(baseUrl, mail) where mail = { messages: [{to, from, subject, text}], waitFor(n), tokenOf(message), signIn(email) }.
   opts.vars: extra settings for the Worker, e.g. { SESSION_TTL_SECONDS: "3" } to test a sign-in ending. */
async function withInjects(fn, opts) {
  opts = opts || {};
  const http = require("http");
  const messages = [];
  const resend = http.createServer((req, res) => {
    let b = ""; req.on("data", d => (b += d));
    req.on("end", () => {
      try { const j = JSON.parse(b); messages.push({ to: j.to && j.to[0], from: j.from, subject: j.subject, text: j.text, auth: req.headers.authorization }); } catch (e) {}
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"id":"test"}');
    });
  });
  await new Promise(r => resend.listen(0, "127.0.0.1", r));
  const mailPort = resend.address().port;
  const port = 8890 + Math.floor(Math.random() * 100);
  const url = "http://127.0.0.1:" + port;
  const store = fs.mkdtempSync(path.join(require("os").tmpdir(), "ballotship-injects-"));
  const vars = Object.assign({ RESEND_URL: "http://127.0.0.1:" + mailPort + "/emails", RESEND_API_KEY: "re_test_key" }, opts.vars || {});
  const args = ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", store];
  Object.keys(vars).forEach(k => args.push("--var", k + ":" + vars[k]));
  const proc = spawn("npx", args, { cwd: path.join(ROOT, "injects"), stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  proc.stdout.on("data", d => (log += d));
  proc.stderr.on("data", d => (log += d));
  const mail = {
    messages,
    async waitFor(n, ms) { const end = Date.now() + (ms || 8000); while (messages.length < n && Date.now() < end) await new Promise(r => setTimeout(r, 100)); return messages.length >= n; },
    tokenOf(m) { const x = /[?&]t=([A-Za-z0-9_-]+)/.exec(m.text); return x ? x[1] : ""; },
    /* Ask for a link, "open" it and return the cookie the browser would keep. */
    async signIn(email) {
      const before = messages.length;
      await fetch(url + "/api/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      if (!(await mail.waitFor(before + 1))) throw new Error("no sign-in email arrived for " + email);
      const res = await fetch(url + "/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: mail.tokenOf(messages[messages.length - 1]) }) });
      const set = res.headers.get("set-cookie") || "";
      if (!res.ok || !set) throw new Error("sign-in failed: " + res.status);
      return set.split(";")[0];
    },
  };
  try {
    const end = Date.now() + 90000;
    let up = false;
    while (!up && Date.now() < end) {
      try { up = (await fetch(url + "/")).ok; } catch (e) {}
      if (!up) await new Promise(r => setTimeout(r, 1000));
    }
    if (!up) throw new Error("local inject library did not start:\n" + log.slice(-2000));
    return await fn(url, mail);
  } finally {
    try { process.kill(-proc.pid); } catch (e) { proc.kill(); }
    resend.close();
    try { fs.rmSync(store, { recursive: true, force: true }); } catch (e) {}
  }
}

/* Join an exercise the way a person does (build 16): the Join button, the code, a side, a name. The page must be
   loaded on the title screen. Returns once the game has started on this screen. */
async function joinGame(p, code, side, name) {
  await p.click("#btnTitleJoin");
  await p.fill("#joinCode", code);
  await p.click("#btnLookup");
  await p.waitForSelector("#joinFound:not([hidden])");
  await p.click(side === "t1" ? "#joinT1" : "#joinT2");
  if (name) await p.fill("#joinName", name);
  await p.click("#btnJoin");
  await p.waitForFunction(() => window.G && G.me, null, { timeout: 15000 });
}

/* Open one screen per side, simultaneous mode, relay on, random placement, no AI artifact required. One screen sets the
   exercise up and the others join with its code (build 16): the moderator sets up when there is one, otherwise team 1.
   Returns {pages, errors, room} (room is the join code). */
async function setupScreens(browser, relayUrl, sides, opts) {
  opts = opts || {};
  const host = sides.includes("mod") ? "mod" : "t1";
  const order = [host, ...sides.filter(s => s !== host)];
  const pages = {}, errors = [];
  let room = null;
  for (const side of order) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(ms => { window.BALLOTSHIP_POLL_MS = ms; }, opts.pollMs || 250);
    await ctx.addInitScript(u => { window.BALLOTSHIP_RELAY_URL = u; }, relayUrl);   // the page's default relay is this local one
    if (opts.deckUrls && opts.deckUrls[side] !== undefined) await ctx.addInitScript(u => { window.BALLOTSHIP_DECK_URL = u; }, opts.deckUrls[side]);   // build 12: which inject library this screen reads
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(side + ": " + e.message));
    pages[side] = p;
    await p.goto(PAGE);
    if (side === host) {
      await p.getByText("Set up the exercise").first().click();
      await p.click("#modeSim");
      await p.click("#side" + side[0].toUpperCase() + side.slice(1));
      if (opts.rounds) await p.selectOption("#rounds", String(opts.rounds));
      if (!(await p.isChecked("#optAuto"))) await p.check("#optAuto");
      if (await p.isChecked("#optAI")) await p.uncheck("#optAI");
      if (await p.isChecked("#optSfx")) await p.uncheck("#optSfx");
      if (await p.isChecked("#optChime")) await p.uncheck("#optChime");
      await p.click("#btnStart");
      await p.waitForFunction(() => window.G && G.joinCode, null, { timeout: 15000 });
      room = await p.evaluate(() => G.joinCode);
    } else {
      await joinGame(p, room, side);
    }
    await p.waitForTimeout(200);
  }
  return { pages, errors, room };
}

const screenOn = p => p.$eval(".screen.on", e => e.id).catch(() => "");
const threadHas = (p, text) => p.evaluate(t => JSON.stringify(G.thread).includes(t), text);

module.exports = { ROOT, PAGE, reporter, withRelay, withInjects, launch, setupScreens, joinGame, screenOn, threadHas };
