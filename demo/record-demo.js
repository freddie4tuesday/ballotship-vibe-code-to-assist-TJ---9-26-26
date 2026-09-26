/*
  Records the Ballotship demo video: Ashwood County (team 1) and Calder County
  (team 2) side by side, playing a 4-round simultaneous game through a local copy
  of the relay, with the approved captions (see README.md in this folder).

    node record-demo.js            -> demo/out/ballotship-demo.mp4 (with voiceover) + .srt subtitles
    node record-demo.js --dry      -> one screenshot per caption in demo/out/dry/, no video

  Voiceover: each caption is read by the Piper text-to-speech voice
  en_US-lessac-high (set PIPER_VOICE to the .onnx file; `pip install piper-tts`).
  The video waits for each line to finish before the next caption. Needs an
  ffmpeg with libx264 and AAC (FFMPEG, or `pip install imageio-ffmpeg`).

  Uses Playwright from ../tests (run `npm install` there first). Nothing touches
  the live site or the live relay. Not part of the app and never deployed.

  Demo-only change: round 4 is swapped for a crisis inject ("Weather or natural
  hazard"), because none of the first four injects in the normal order is one.
  This happens only inside the recording (the same swap on both screens, so the
  decks still match); the game itself is unchanged, and caption 21 says so.
*/
const path = require("path");
const fs = require("fs");
const http = require("http");
const { execFileSync } = require("child_process");
const { chromium } = require(path.join(__dirname, "..", "tests", "node_modules", "playwright"));
const { withRelay } = require(path.join(__dirname, "..", "tests", "helpers"));

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const DRY = process.argv.includes("--dry");
const PORTS = [8600, 8601, 8602];          // stage, team 1, team 2: separate origins keep each team's saved game apart
const SPEED = DRY ? 0 : 1;                 // dry run skips the reading pauses
const VOICE = process.env.PIPER_VOICE;
const ROOM = "demo-room-" + Date.now().toString(36);   // both screens join the same relay room

/* The approved captions, in order. The voice reads the same words (see SAY_OVERRIDES). */
const CAPTIONS = {
  1: "<b>Ballotship: an election readiness exercise.</b> Here's a short game from start to finish, so you know what to expect.",
  2: "Ballotship is two exercises in one. A board game keeps it moving; <b>the real work is what your team writes each round.</b>",
  3: "Two teams each play a county election office. Here, <b>Ashwood County</b> and <b>Calder County</b>. A facilitator sets up the game and runs the clock.",
  4: "Each county hides <b>seven sites</b> it depends on in a 6×6 grid: polling places, vote centers, a mail sorting facility, a utility node, and the election operations center.",
  5: "Only your own team sees your grid. The other county has no idea where your sites are. That's the guessing-game half, like the classic board game Battleship.",
  6: "Each round starts with an <b>inject</b>: a scenario card describing one realistic problem. Both teams get the same one.",
  7: "This one: voters are told they're not on the list, the pollbook doesn't match the office's records, and provisional ballots are stacking up.",
  8: "First, each team plays the <b>attacker</b>. They aim this problem at a square on the other county's grid, without knowing where anything is.",
  9: "The problem covers a set of squares called its <b>footprint</b>. This one covers two squares side by side.",
  10: "Then they write how the attack plays out: where it lands, what happens, when, and what they're trying to break. In a real session they'd also make a piece with AI, like a fake text or headline.",
  11: "Both teams commit. Their written attacks swap between screens, automatically through the relay or by reading a short code aloud.",
  12: "Now each team switches sides and plays its own <b>election office</b>. They read the attack aimed at them, but they still don't know which squares it will hit.",
  13: "They write their response the way a real office would: who owns it, who else needs to know, what they do operationally, and whether a policy already covers it.",
  14: "Then the most important box: the <b>exact words</b> that go out to voters. Not a description of a message, the message itself.",
  15: "And the gap: what they'd need that they don't have today. This line becomes an <b>action item</b> after the exercise.",
  16: "The response can't change where the attack lands. It's the record the group reviews together at the end.",
  17: "Now the attack lands. Any site under the footprint is <b>hit</b>. Squares with no site are misses.",
  18: "A site with every square hit goes <b>offline</b> for the rest of the game. Ashwood's polling place is out.",
  19: "Then each team sees a <b>precedent</b>: a real event like this one, and how it actually played out.",
  20: "Every round repeats the same pattern: a new inject, attack, response, result. Hits and misses help each team work out where the other's sites are.",
  21: "Some injects are a <b>crisis</b> that hits the whole county at once. There's nothing to aim at. <i>(Shown in round 4 for this demo; in a real game crisis injects come at set points.)</i>",
  22: "Each team chooses which two of its own squares go down. It's the only real decision the defending team gets on the board.",
  23: "For a crisis, the written job is a <b>continuity statement</b>: the words telling voters what's still open, what moved, and what to do.",
  24: "When the rounds run out, the county with fewer sites offline <b>wins the board</b>.",
  25: "But the board isn't the point. A team can lose the board and still leave with the better plan. <b>The written responses are what the group reviews together afterward.</b>",
  26: "<b>Ballotship.</b> Find the gaps before Election Day does. Ready for Tuesday.",
};

/* What the voice says for each caption: the caption text, except where a written
   form reads badly aloud. */
const SAY_OVERRIDES = {
  4: "Each county hides seven sites it depends on in a six by six grid: polling places, vote centers, a mail sorting facility, a utility node, and the election operations center.",
  21: "Some injects are a crisis that hits the whole county at once. There's nothing to aim at. For this demo, it's shown in round four. In a real game, crisis injects come at set points.",
};
const plain = html => html.replace(/<[^>]+>/g, "").replace(/&times;/g, "×").replace(/\s+/g, " ").trim();

function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try { return execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim(); } catch (e) { return null; }
}
/* Synthesize one line to a WAV and return its length in ms. */
function speak(n, text) {
  const wav = path.join(OUT, "voice", String(n).padStart(2, "0") + ".wav");
  execFileSync("python3", ["-m", "piper", "-m", VOICE, "-f", wav], { input: text });
  const buf = fs.readFileSync(wav);
  const rate = buf.readUInt32LE(24), bytes = buf.readUInt32LE(40);
  return { wav, ms: Math.round(bytes / (rate * 2) * 1000) };
}

/* The sandbox this was built in can't reach readyfortuesday.com or Google Fonts
   directly from the browser, so those requests are fetched with curl instead and
   handed to the page. Harmless anywhere else: the page gets the same files. */
const assetCache = new Map();
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const curl = u => execFileSync("curl", ["-sSL", "-A", UA, u], { maxBuffer: 64 * 1024 * 1024 });
/* Everything is fetched once, before recording. Fetching inside the route handler
   froze the script long enough for the game's relay messages to fail. */
function prefetchAssets() {
  const pages = [path.join(ROOT, "index.html"), path.join(__dirname, "director.html")].map(f => fs.readFileSync(f, "utf8")).join("\n");
  const urls = new Set((pages.match(/https:\/\/(?:readyfortuesday\.com|fonts\.googleapis\.com)[^"')\s]+/g) || []).map(u => u.replace(/&amp;/g, "&")));
  for (const u of urls) {
    try {
      const body = curl(u); assetCache.set(u, body);
      if (/fonts\.googleapis/.test(u)) for (const f of body.toString().match(/https:\/\/fonts\.gstatic\.com[^)\s]+/g) || []) if (!assetCache.has(f)) assetCache.set(f, curl(f));
    } catch (e) { console.log("could not prefetch " + u); }
  }
}
async function routeAssets(ctx) {
  await ctx.route(/readyfortuesday\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, route => {
    const u = route.request().url();
    if (!assetCache.has(u)) return route.abort();
    const type = /fonts\.googleapis/.test(u) ? "text/css" : /\.woff2/.test(u) ? "font/woff2" : /\.png/.test(u) ? "image/png" : "application/octet-stream";
    return route.fulfill({ status: 200, contentType: type, body: assetCache.get(u), headers: { "access-control-allow-origin": "*" } });
  });
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
function serve(port) {
  return new Promise(res => {
    const s = http.createServer((req, rsp) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rsp);
    }).listen(port, "127.0.0.1", () => res(s));
  });
}

/* ---------- the sample game's writing (fictional county, fictional names) ---------- */
const ATTACK = {
  t1: { where: "Two early-voting sites on Calder's east side get last cycle's pollbooks.",
        what: "Newly registered voters aren't in the books. Poll workers start handing out provisional ballots.",
        when: "6 a.m., before anyone checks the book counts.",
        goal: "A 'they purged us' story trending before noon." },
  t2: { where: "The downtown vote center gets a pollbook missing one precinct.",
        what: "A whole precinct's voters are told they aren't registered.",
        when: "Mid-morning, when the line is longest.",
        goal: "Voters walking away without voting, and a claim it was deliberate." },
};
const RESPONSE = {
  lead: "Deputy director of elections, backed up by the operations manager.",
  notify: "Site leads, county IT, the county communications office, and our state liaison.",
  ops: "Courier supplemental pollbooks within the hour, keep issuing provisionals with a tracking note, reconcile at close.",
  policy: "Yes. Our provisional ballot procedure covers this.",
  comms: "Poll workers first, then the call center, then the press line. The director signs off.",
  statement: "Some voters at two sites are being offered provisional ballots because of a pollbook error. Every provisional ballot will be reviewed and counted once registration is confirmed. Updated pollbooks are on the way.",
  gap: "A way to confirm pollbook versions at every site before doors open.",
};
const CRISIS_STATEMENT = "Severe weather has closed two voting sites. All other sites are open. Voters assigned to the closed sites can vote at any vote center today; the list is on our website and at 555-0100.";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  if (DRY) fs.mkdirSync(path.join(OUT, "dry"), { recursive: true });
  if (!DRY) {
    if (!VOICE || !fs.existsSync(VOICE)) throw new Error("set PIPER_VOICE to the en_US-lessac-high.onnx voice file (see README.md)");
    fs.mkdirSync(path.join(OUT, "voice"), { recursive: true });
  }
  const spoken = [];   // {n, text, wav, ms, at} — 'at' is ms from the start of the video
  /* All voice lines are made before recording. Making them during it stalled the
     screen capture and let the picture drift about 5 seconds behind the voice. */
  const voice = {};
  if (!DRY) for (const n of Object.keys(CAPTIONS)) voice[n] = speak(n, SAY_OVERRIDES[n] || plain(CAPTIONS[n]));
  prefetchAssets();
  const servers = await Promise.all(PORTS.map(serve));
  let browser;
  try {
    await withRelay(async relay => {
      browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 1920, height: 1080 } },
        DRY ? {} : { recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } } }));
      // Fast enough to feel live, well under the relay's 400-a-minute room limit.
      await ctx.addInitScript(() => { window.BALLOTSHIP_POLL_MS = 700; });
      await routeAssets(ctx);
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on("console", m => { if (m.type() === "error" || m.type() === "warning") consoleErrors.push(m.text().slice(0, 200)); });
      page.on("requestfailed", r => consoleErrors.push("FAILED " + r.url().slice(0, 90) + " " + (r.failure() || {}).errorText));
      const t0 = Date.now();          // the recording starts with the page
      const url = p => "http://127.0.0.1:" + p + "/index.html";
      await page.goto("http://127.0.0.1:" + PORTS[0] + "/demo/director.html?f1=" + encodeURIComponent(url(PORTS[1])) + "&f2=" + encodeURIComponent(url(PORTS[2])));
      await page.waitForTimeout(1500);
      const F = { t1: page.frames().find(f => f.url().includes(":" + PORTS[1])), t2: page.frames().find(f => f.url().includes(":" + PORTS[2])) };
      const both = fn => Promise.all([fn(F.t1, "t1"), fn(F.t2, "t2")]);
      /* On any failure, say where each screen was, so a broken step is easy to find. */
      const diagnose = async () => {
        for (const k of ["t1", "t2"]) console.log(k, await F[k].evaluate(() => ({ screen: (document.querySelector(".screen.on") || {}).id,
          round: window.G && G.round, sim: window.G && G.simPhase, relay: window.G && G.relay, stat: [...document.querySelectorAll(".relaystat,.dockstat")].map(e => e.hidden ? "" : e.textContent).filter(Boolean), err: [...document.querySelectorAll(".err:not([hidden])")].map(e => e.textContent) })).catch(e => e.message));
        for (const k of ["t1", "t2"]) console.log(k, "direct poll:", await F[k].evaluate(async () => {
          try { const r = await fetch(G.relay.url.replace(/\/+$/, "") + "/room/" + G.relay.room + "/poll?since=0&as=" + G.me); return r.status + " " + (await r.text()).slice(0, 120); }
          catch (e) { return "ERR " + e.message; } }).catch(e => e.message));
        console.log("console errors:", consoleErrors.slice(-6).join(" | "));
        await page.screenshot({ path: path.join(OUT, "failure.png") });
      };

      const wait = ms => page.waitForTimeout(Math.max(DRY ? 150 : 0, ms * SPEED));
      let voiceFreeAt = 0;            // the previous line must finish before the next caption
      async function cap(n, ms) {
        const html = CAPTIONS[n];
        if (!DRY && Date.now() < voiceFreeAt) await page.waitForTimeout(voiceFreeAt - Date.now());
        await page.evaluate(([h, n]) => setCaption(h, n), [html, n]);
        await page.waitForTimeout(400);
        if (DRY) await page.screenshot({ path: path.join(OUT, "dry", String(n).padStart(2, "0") + ".png") });
        else {
          const v = voice[n];
          spoken.push({ n, text: plain(html), wav: v.wav, ms: v.ms, at: Date.now() - t0 - 150 });
          voiceFreeAt = Date.now() + v.ms + 700;
        }
        await wait(ms);
      }
      const hl = (f, sel) => f.evaluate(s => {
        document.querySelectorAll("[data-demo-hl]").forEach(e => { e.style.outline = ""; e.removeAttribute("data-demo-hl"); });
        const e = s && document.querySelector(s); if (!e) return;
        e.setAttribute("data-demo-hl", "1"); e.style.outline = "5px solid #E4572E"; e.style.outlineOffset = "4px";
        e.scrollIntoView({ block: "center", behavior: "smooth" });
      }, sel);
      const scrollTo = (f, sel) => f.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: "center", behavior: "smooth" }); }, sel);
      /* Typed inside each screen, not through the shared keyboard: both teams type at
         once, and real key presses would interleave between the two screens. */
      const type = (f, sel, text) => f.evaluate(async ([s, t, d]) => {
        const e = document.querySelector(s); e.focus(); e.value = "";
        for (let i = 1; i <= t.length; i++) {
          e.value = t.slice(0, i); e.dispatchEvent(new Event("input", { bubbles: true }));
          if (d) await new Promise(r => setTimeout(r, d));
        }
        e.dispatchEvent(new Event("change", { bubbles: true }));
      }, [sel, text, DRY ? 0 : 22]);
      const labelOf = (f, i) => f.evaluate(i => cellLabel(i), i);
      /* Screens redraw their forms for a moment after they appear, which can wipe a
         value filled in too early. Fill, give it a beat, and refill anything that
         didn't stick. */
      /* Set a field's value inside its own screen. Playwright's fill() types through the
         page's one shared keyboard focus, so two screens filling at once garble each other. */
      const setVal = (f, sel, v) => f.evaluate(([s, v]) => {
        const e = document.querySelector(s); e.value = v;
        e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true }));
      }, [sel, v]);
      const fillStable = async (f, ids, text) => {
        for (let tries = 0; tries < 4; tries++) {
          for (const id of ids) if (!(await f.inputValue(id))) await setVal(f, id, typeof text === "function" ? text(id) : text);
          await f.waitForTimeout(350);
          let ok = true; for (const id of ids) if (!(await f.inputValue(id))) ok = false;
          if (ok) return;
        }
      };
      /* Scripted aim, so the demo plays out the same way every time and never ties
         (a tie would go to sudden death). 'want' is a cell to hit on the other
         board, or null to find a spot where the whole footprint misses. */
      const aimFor = async (side, want) => {
        const other = side === "t1" ? "t2" : "t1";
        const board = await F[other].evaluate(o => G.teams[o].board, other);
        return F[side].evaluate(([board, want]) => {
          const shape = G.R.card.shape;
          for (let o = 0; o < 36; o++) {
            const cells = footprint(o, shape);
            if (cells.length < SHAPES[shape].cells.length) continue;          // runs off the grid
            if (want !== null ? cells.indexOf(want) >= 0 : cells.every(c => !board[c])) return cellLabel(o);
          }
          return cellLabel(0);
        }, [board, want]);
      };
      /* Wait for the game to reach a screen instead of guessing how long it takes. */
      const until = (f, id) => f.waitForFunction(id => { const e = document.querySelector(".screen.on"); return e && e.id === id; }, id, { timeout: 60000 });
      const bothUntil = id => both(f => until(f, id));

      try {
      /* ---------- opening ---------- */
      await page.evaluate(() => showCard("An election readiness exercise"));
      await cap(1, 7000);
      await page.evaluate(() => hideCard());
      await cap(2, 7000);

      await both(f => f.click("#btnTitleGo"));
      await both(async (f, side) => {
        await f.click(side === "t1" ? "#sideT1" : "#sideT2");
        await f.selectOption("#rounds", "4");
        if (!(await f.isChecked("#optOnline"))) await f.check("#optOnline");
        await setVal(f, "#relayUrl", relay);
        await fillStable(f, ["#relayRoom"], ROOM);
        for (const id of ["#optAI", "#optSfx", "#optChime", "#optAuto"]) if (await f.isChecked(id)) await f.uncheck(id);   // placement is shown on camera
      });
      await cap(3, 7000);

      // Round 4 becomes a crisis inject, on both screens identically (demo only).
      await both(f => f.evaluate(() => {
        const orig = drawCard, crisis = DECK.find(c => c.title.indexOf("Weather") === 0);
        window.drawCard = function () { return G.sim && G.round === 4 ? crisis : orig(); };
      }));
      await both(async f => { if ((await f.inputValue("#relayRoom")) !== ROOM) await setVal(f, "#relayRoom", ROOM); });
      await both(f => f.click("#btnStart"));
      await bothUntil("screen-place");
      // Never let the demo talk to the live relay.
      for (const k of ["t1", "t2"]) { const u = await F[k].evaluate(() => G.relay && G.relay.url); if (u !== relay) throw new Error(k + " is not on the local relay: " + u); }
      await both(f => f.click("#btnRand"));
      await wait(800);

      /* ---------- the board ---------- */
      await both(f => scrollTo(f, "#placeGrid"));
      await cap(4, 9000);
      await cap(5, 8000);
      await both(f => f.click("#btnPlaceDone"));
      await bothUntil("screen-sim-attack");
      await wait(1000);
      await both(f => f.evaluate(() => { if (!document.getElementById("aimSheet").hidden) document.getElementById("btnAimCancel").click(); }));

      /* ---------- round 1: the attack ---------- */
      await both(f => scrollTo(f, "#saCard"));
      await cap(6, 8000);
      await both(f => hl(f, "#saCard"));
      await cap(7, 9000);
      await both(f => hl(f, null));

      // Calder aims at Ashwood's one-square polling place; Ashwood aims at Calder's
      // four-square operations center (a hit that can't knock it out in one shot).
      const pp = await F.t1.evaluate(() => G.teams.t1.board.indexOf("pp1"));
      const eoc = await F.t2.evaluate(() => G.teams.t2.board.indexOf("eoc"));
      const target = { t2: await aimFor("t2", pp), t1: await aimFor("t1", eoc) };
      await both(async f => { await f.click("#saAim button"); });
      await cap(8, 7000);
      await both((f, side) => f.hover('#aimGrid button[aria-label="' + target[side] + '"]'));
      await cap(9, 6000);
      await both(async (f, side) => { await f.click('#aimGrid button[aria-label="' + target[side] + '"]'); await wait(700); await f.click("#btnAimOk"); });

      await cap(10, 1000);
      await both(async (f, side) => {
        await scrollTo(f, "#saForm");
        await type(f, "#sa_where", ATTACK[side].where);
        await type(f, "#sa_what", ATTACK[side].what);
        await type(f, "#sa_when", ATTACK[side].when);
        await type(f, "#sa_goal", ATTACK[side].goal);
      });
      await wait(2500);
      await both(f => hl(f, "#btnSaCommit"));
      await cap(11, 3000);
      await both(f => f.click("#btnSaCommit"));
      await bothUntil("screen-sim-defense");
      await wait(2000);

      /* ---------- round 1: the response ---------- */
      await both(f => f.evaluate(() => { const s = document.getElementById("briefSheet"); if (s && !s.hidden) document.getElementById("btnBriefX").click(); }));
      await both(f => hl(f, "#sdAttack"));
      await cap(12, 9000);
      await cap(13, 500);
      await both(async f => {
        await hl(f, "#sd_lead"); await type(f, "#sd_lead", RESPONSE.lead);
        await hl(f, "#sd_notify"); await type(f, "#sd_notify", RESPONSE.notify);
        await hl(f, "#sd_ops"); await type(f, "#sd_ops", RESPONSE.ops);
        await hl(f, "#sd_policy"); await type(f, "#sd_policy", RESPONSE.policy);
        await hl(f, "#sd_comms"); await type(f, "#sd_comms", RESPONSE.comms);
      });
      await both(f => hl(f, "#sd_statement"));
      await cap(14, 500);
      await both(f => type(f, "#sd_statement", RESPONSE.statement));
      await wait(3000);
      await both(f => hl(f, "#sd_gap"));
      await cap(15, 500);
      await both(f => type(f, "#sd_gap", RESPONSE.gap));
      await wait(3000);
      await both(f => hl(f, "#btnSdCommit"));
      await cap(16, 4000);
      await both(f => f.click("#btnSdCommit"));
      await bothUntil("screen-sim-resolve");
      await wait(2000);

      /* ---------- round 1: the result ---------- */
      await both(f => hl(f, null));
      await both(f => scrollTo(f, "#srMyGrid"));
      await cap(17, 8000);
      await cap(18, 8000);
      await both(f => scrollTo(f, "#srPrec"));
      await cap(19, 8000);

      /* ---------- rounds 2 and 3, quickly ---------- */
      await cap(20, 0);
      async function quickRound(n) {
        await both(f => f.click("#btnSrNext"));
        await bothUntil("screen-sim-attack");
        await wait(800);
        await both(async f => {
          await f.waitForSelector("#aimSheet:not([hidden])", { timeout: 5000 }).catch(() => {});
          if (await f.isVisible("#aimSheet")) {
            const side = f === F.t1 ? "t1" : "t2";
            // Ashwood hits Calder's polling places; Calder's shots miss.
            const want = side === "t1" ? await F.t2.evaluate(id => G.teams.t2.board.indexOf(id), n === 2 ? "pp1" : "pp2") : null;
            await f.click('#aimGrid button[aria-label="' + (await aimFor(side, want)) + '"]'); await f.click("#btnAimOk");
            await f.waitForTimeout(700);   // the attack form redraws after the target locks
          }
          await fillStable(f, ["#sa_where", "#sa_what", "#sa_when", "#sa_goal"], "Round " + n + " attack, written by the team.");
          await f.click("#btnSaCommit");
        });
        await bothUntil("screen-sim-defense");
        await wait(1500);
        await both(async f => {
          await f.evaluate(() => { const s = document.getElementById("briefSheet"); if (s && !s.hidden) document.getElementById("btnBriefX").click(); });
          await f.waitForTimeout(500);
          await fillStable(f, ["#sd_lead", "#sd_notify", "#sd_ops", "#sd_policy", "#sd_comms", "#sd_statement", "#sd_gap"], "Round " + n + " response: who acts, who we tell, and the words that go out.");
          await f.click("#btnSdCommit");
        });
        await bothUntil("screen-sim-resolve");
        await wait(1500);
        await both(f => scrollTo(f, "#srMyGrid"));
        await wait(2500);
      }
      await quickRound(2);
      await quickRound(3);

      /* ---------- round 4: crisis ---------- */
      await both(f => f.click("#btnSrNext"));
      await bothUntil("screen-sim-attack");
      await wait(1000);
      await both(f => hl(f, "#saCard"));
      await cap(21, 9000);
      await both(async f => {
        await hl(f, null);
        await f.waitForTimeout(500);
        await fillStable(f, ["#sa_where", "#sa_what", "#sa_when", "#sa_goal"], "Round 4: the storm, as the attacker writes it.");
        await f.click("#btnSaCommit");
      });
      await bothUntil("screen-sim-defense");
      await wait(1500);
      await both(f => f.evaluate(() => { const s = document.getElementById("briefSheet"); if (s && !s.hidden) document.getElementById("btnBriefX").click(); }));
      await both(f => scrollTo(f, "#sdGrid"));
      await cap(22, 1500);
      await both(async f => {
        // Cells still up: our own sites not yet hit. The grid redraws on every
        // click, so each square is looked up fresh by its label.
        const labels = await f.evaluate(() => {
          const me = G.teams[G.me], out = [];
          // The four-square operations center, so no site goes fully offline here.
          for (let i = 0; i < 36 && out.length < G.R.resp.need; i++) if (me.board[i] === "eoc" && !me.hits[i]) out.push(cellLabel(i));
          return out;
        });
        for (const l of labels) { await f.click('#sdGrid button[aria-label="' + l + '"], #sdGrid [aria-label="' + l + '"]'); await wait(900); }
      });
      await wait(3000);
      await both(f => hl(f, "#sd_statement"));
      await cap(23, 500);
      await both(async f => {
        await fillStable(f, ["#sd_lead", "#sd_notify", "#sd_ops", "#sd_policy", "#sd_comms", "#sd_gap"], "Round 4 response: who acts, who we tell, and in what order.");
        await type(f, "#sd_statement", CRISIS_STATEMENT);
      });
      await wait(3000);
      await both(async f => { await hl(f, null); await f.click("#btnSdCommit"); });
      await bothUntil("screen-sim-resolve");
      await wait(2500);
      await both(f => f.click("#btnSrNext"));   // "See the result"
      await bothUntil("screen-over");
      await wait(1500);

      /* ---------- the end ---------- */
      await both(f => scrollTo(f, "#overW"));
      await cap(24, 8000);
      await both(f => hl(f, "#btnExport"));
      await cap(25, 10000);
      await both(f => hl(f, null));
      await page.evaluate(() => showCard("Find the gaps before Election Day does."));
      await cap(26, 6000);

      } catch (e) { await diagnose(); throw e; }
      if (!DRY && Date.now() < voiceFreeAt) await page.waitForTimeout(voiceFreeAt - Date.now());
      const endScreens = [await F.t1.$eval(".screen.on", e => e.id), await F.t2.$eval(".screen.on", e => e.id)];
      console.log("final screens:", endScreens.join(", "));
      const video = DRY ? null : page.video();
      await ctx.close();
      if (video) {
        const webm = path.join(OUT, "ballotship-demo.webm");
        fs.renameSync(await video.path(), webm);
        const ff = ffmpegPath();
        if (!ff) throw new Error("no ffmpeg with libx264 found; set FFMPEG or pip install imageio-ffmpeg");
        /* Find when each caption actually appears in the video from its timing mark.
           The recorder's clock stretches over a long recording (about 5 s by the end),
           so the script's own timestamps can't be trusted for this. */
        const FPS = 25;
        const raw = execFileSync(ff, ["-loglevel", "error", "-i", webm, "-vf", "crop=12:12:1906:1066,scale=1:1", "-r", String(FPS), "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 64 * 1024 * 1024 });
        const seen = {};
        for (let i = 0; i < raw.length; i++) {
          const n = Math.round((raw[i] - 10) / 9);
          // must hold for 3 frames, so a passing fade can't be mistaken for a mark
          const hold = i + 2 < raw.length && Math.abs(raw[i + 1] - raw[i]) <= 2 && Math.abs(raw[i + 2] - raw[i]) <= 2;
          if (n >= 1 && n <= 26 && seen[n] === undefined && hold && Math.abs(raw[i] - (10 + 9 * n)) <= 3) seen[n] = Math.round(i * 1000 / FPS);
        }
        spoken.forEach(v => { if (seen[v.n] !== undefined) { v.drift = seen[v.n] - v.at; v.at = seen[v.n]; } else console.log("no timing mark found for caption " + v.n + "; using the script's clock"); });
        console.log("drift at first/last caption (ms):", spoken[0].drift, spoken[spoken.length - 1].drift);
        // Place each voice line at the moment its caption appeared, then mix under the video.
        const args = ["-y", "-loglevel", "error", "-i", webm];
        spoken.forEach(v => args.push("-i", v.wav));
        const chains = spoken.map((v, i) => "[" + (i + 1) + ":a]adelay=" + Math.max(0, v.at) + "|" + Math.max(0, v.at) + "[a" + i + "]");
        const mix = spoken.map((v, i) => "[a" + i + "]").join("") + "amix=inputs=" + spoken.length + ":normalize=0[aout]";
        const mp4 = path.join(OUT, "ballotship-demo.mp4");
        args.push("-filter_complex", chains.join(";") + ";" + mix, "-map", "0:v", "-map", "[aout]", "-vf", "drawbox=x=1900:y=1060:w=20:h=20:color=0x0E1F1A:t=fill",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "medium",
          "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", mp4);
        execFileSync(ff, args);
        // Subtitles, timed to the voice.
        const ts = ms => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s2 = Math.floor(ms / 1000) % 60, x = ms % 1000;
          return [h, m, s2].map(v => String(v).padStart(2, "0")).join(":") + "," + String(x).padStart(3, "0"); };
        const srt = spoken.map((v, i) => (i + 1) + "\n" + ts(v.at) + " --> " + ts(v.at + v.ms + 500) + "\n" + v.text + "\n").join("\n");
        fs.writeFileSync(path.join(OUT, "ballotship-demo.srt"), srt);
        fs.writeFileSync(path.join(OUT, "voice-timing.json"), JSON.stringify(spoken, null, 1));
        console.log("video:", mp4);
      }
    });
  } finally {
    if (browser) await browser.close();
    servers.forEach(s => s.close());
  }
})().catch(e => { console.error(e); process.exit(1); });
