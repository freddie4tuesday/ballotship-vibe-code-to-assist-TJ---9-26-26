/*
  One screen sets the exercise up and the others join with a code (build 16).

    - the setup form: with the relay on, this screen is the moderator's or team 1's (no team 2), only team 1 types a
      name, and there is no relay address or room name to type; with it off, every screen is set up by hand as before
    - the host gets a short code (a word and three digits), its room is checked to be unused, and the host's screen
      keeps showing it until everyone has joined
    - the room holds one settings message with every shared setting and the inject deck; nothing else is needed to join
    - a joining screen finds the exercise from the code, says what it is, offers the free sides, takes its own team
      name, and starts with the host's settings (rounds, precedent, clock times, AI requirement, random placement) and
      the HOST's inject deck, even if its own library copy differs
    - each team's screen learns the other team's name; the moderator sees both
    - two screens choosing the same side at once: one wins, the other is told and chooses again
    - a wrong code and an unreachable relay each say what to do
    - a moderator may post the exercise's settings but not other things (the relay's rule)
    - a saved host game comes back with its code
*/
const { reporter, withRelay, launch, joinGame, screenOn, PAGE } = require("./helpers");

const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  const r = reporter("Join codes: one screen sets up, the others join");
  let browser;
  try {
    await withRelay(async relay => {
      browser = await launch();
      const errors = [];
      const open = async (opts) => {
        opts = opts || {};
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        await ctx.addInitScript(u => { window.BALLOTSHIP_RELAY_URL = u; window.BALLOTSHIP_POLL_MS = 400; }, opts.relay === undefined ? relay : opts.relay);
        if (opts.deckUrl !== undefined) await ctx.addInitScript(u => { window.BALLOTSHIP_DECK_URL = u; }, opts.deckUrl);
        const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message));
        if (opts.route) await opts.route(p);
        await p.goto(PAGE);
        return p;
      };
      const setupPage = async (opts) => { const p = await open(opts); await p.click("#btnTitleGo"); return p; };
      const room = async code => (await (await fetch(relay + "/room/" + code + "/poll?as=mod&since=0")).json()).messages;
      const ui = p => p.evaluate(() => ({ t2: !document.getElementById("sideT2").hidden, hint: !document.getElementById("hostHint").hidden,
        n1: !document.getElementById("fldN1").hidden, n2: !document.getElementById("fldN2").hidden, l1: document.getElementById("lblN1").textContent,
        names: !document.getElementById("namesHint").hidden, room: !!document.getElementById("relayRoom"), relayShown: document.getElementById("relayUrl").type !== "hidden" }));

      // ---- the setup form ----
      {
        const p = await setupPage();
        r.check("there is no relay checkbox on the setup screen", (await p.$("#optOnline")) === null);
        await p.click("#modeSim");
        let u = await ui(p);
        r.check("two screens: no Team 2 choice, the host hint shows, only Team 1's name is asked (as 'Your team name')", !u.t2 && u.hint && u.n1 && !u.n2 && u.l1 === "Your team name" && !u.names, JSON.stringify(u));
        r.check("...and there is no relay address or room name to type", !u.room && !u.relayShown);
        await p.click("#sideMod"); u = await ui(p);
        r.check("moderator: no team names asked at all", !u.n1 && !u.n2, JSON.stringify(u));
        await p.click("#modeRelay"); u = await ui(p);
        r.check("taking turns: no Moderator choice (only simultaneous has one), so it moves to Team 1", !(await p.isVisible("#sideMod")) && (await p.$eval("#sideT1", e => e.classList.contains("on"))));
        r.check("the mode cards say what is true now (join code, moderator optional; needs internet at the start)",
          (await p.$eval("#modeSim p", e => e.textContent)) === "Both teams get the same inject at the same time. They write their attacks on one clock, swap them, then write their responses on a second clock. One screen sets up and the others join with a code. A moderator is optional; any screen can pause the clock and the others follow." &&
          (await p.$eval("#modeRelay p", e => e.textContent)) === "Each team runs its own copy on its own device and plays in turn: one team attacks, the other responds. One screen sets up and the other joins with a code. Needs internet at the start.");
        await p.click("#modePass"); u = await ui(p);
        r.check("one laptop: no relay anywhere, so nothing to set up by hand", true);
        await p.context().close();
      }
      // ---- no relay reachable: the way round is "Set up by hand" ----
      {
        const p = await setupPage({ relay: "http://127.0.0.1:9" });
        await p.click("#modeSim"); await p.click("#sideT1"); await p.check("#optAuto");
        r.check("the 'Set up by hand' button is not there until the relay fails", !(await p.isVisible("#btnManual")));
        await p.fill("#jurisdiction", "Test County"); await p.click("#btnStart");
        await p.waitForFunction(() => !document.getElementById("startErr").hidden);
        r.check("an unreachable relay at Start says what to do", (await p.$eval("#startErr", e => e.textContent)) === "Can't reach the relay. Check your connection and try again, or set up by hand. Without the relay, teams read codes out loud and type them in.");
        r.check("...and offers 'Set up by hand', with nothing started", (await p.isVisible("#btnManual")) && !(await p.evaluate(() => !!(window.G && G.me))));
        await p.click("#btnManual");
        const u = await ui(p);
        r.check("by hand: Team 2 is offered again, both names are asked, the old hint shows, and there is no Moderator", u.t2 && u.n1 && u.n2 && u.l1 === "Team 1 name" && u.names && !u.hint && !(await p.isVisible("#sideMod")), JSON.stringify(u));
        await p.fill("#jurisdiction", "Test County"); await p.click("#btnStart");
        await p.waitForFunction(() => window.G && G.me, null, { timeout: 15000 });
        const g = await p.evaluate(() => ({ relay: G.relay, code: G.joinCode || null, n1: G.teams.t1.name, n2: G.teams.t2.name }));
        r.check("...and the game starts with no relay and no join code, both names as typed", g.relay === null && g.code === null && g.n1 === "Ashwood County" && g.n2 === "Calder County", JSON.stringify(g));
        await p.context().close();
      }

      // ---- a team hosts ----
      const deckTitle = "Deck from the host: " + Date.now();
      const fakeDeck = async () => { const g = JSON.parse(require("fs").readFileSync(require("path").join(__dirname, "..", "injects", "seed.json"), "utf8")); g.injects[0].title = deckTitle; return { version: 7, injects: g.injects }; };
      const hostRoute = async p => { const d = await fakeDeck(); await p.route("https://lib.test/deck", route => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(d) })); };
      const host = await setupPage({ deckUrl: "https://lib.test/deck", route: hostRoute });
      await until(async () => /library version 7/.test(await host.$eval("#deckNote", e => e.textContent)), 8000);
      await host.click("#modeSim"); await host.click("#sideT1");
      await host.selectOption("#rounds", "4"); await host.fill("#rn1", "Ashwood County");
      await host.uncheck("#optPrec"); await host.check("#optAI"); await host.check("#optAuto");
      await host.fill("#durA", "3:30"); await host.fill("#durD", "4:15");
      await host.fill("#jurisdiction", "Test County"); await host.click("#btnStart");
      await host.waitForFunction(() => window.G && G.joinCode, null, { timeout: 15000 });
      const code = await host.evaluate(() => G.joinCode);
      r.check("the host gets a join code: a word and three digits", /^[a-z]{3,10}-\d{3}$/.test(code), code);
      const bannerText = await host.$eval("#joinBanner", e => e.hidden ? "" : e.textContent);
      r.check("the host's screen shows the code and says it is waiting for Team 2", bannerText.includes(code) && /Give it to the other screens/.test(bannerText) && /Waiting for Team 2 to join\./.test(bannerText), bannerText);
      let msgs = await room(code);
      const setup = msgs.find(m => /-SETUP$/.test(m.code));
      const st = setup && JSON.parse(setup.note), dk = setup && JSON.parse(setup.note2);
      r.check("the room holds one settings message with the shared settings", !!st && st.rounds === 4 && st.mode === "sim" && st.prec === false && st.ai === true && st.auto === true && st.durA === 210 && st.durD === 255 && st.host === "t1" && st.hostName === "Ashwood County", JSON.stringify(st));
      r.check("...and the host's inject deck (version 7, the host's first title)", dk && dk.version === 7 && dk.injects[0].title === deckTitle && dk.injects.length === 16);
      await until(async () => (await room(code)).some(m => /-JOIN$/.test(m.code)), 5000);   // the host's JOIN is sent once its settings message has been accepted
      msgs = await room(code);
      r.check("...and the host's own JOIN", msgs.some(m => /-JOIN$/.test(m.code) && JSON.parse(m.note).side === "t1" && JSON.parse(m.note).name === "Ashwood County"));

      // ---- errors ----
      const j = await open();   // a joining screen, on its own, deck library off (the built-in deck)
      await j.click("#btnTitleJoin");
      await j.fill("#joinCode", "nosuch-999"); await j.click("#btnLookup");
      await j.waitForFunction(() => !document.getElementById("joinErr").hidden);
      r.check("a wrong code says to check it with whoever set it up", /There is no exercise with that code\. Check it with whoever set it up, then try again\./.test(await j.$eval("#joinErr", e => e.textContent)));
      await j.fill("#joinCode", "not a code!"); await j.click("#btnLookup");
      r.check("something that can't be a code says the same, without a request", /There is no exercise with that code/.test(await j.$eval("#joinErr", e => e.textContent)));
      const down = await open({ relay: "http://127.0.0.1:9" });
      await down.click("#btnTitleJoin"); await down.fill("#joinCode", code); await down.click("#btnLookup");
      await down.waitForFunction(() => !document.getElementById("joinErr").hidden);
      r.check("an unreachable relay says so and what to do", /Can't reach the relay\. Check your connection and try again\./.test(await down.$eval("#joinErr", e => e.textContent)));
      await down.context().close();

      // ---- too many wrong codes (a relay of its own with a limit of 3, so this is quick) ----
      await withRelay(async relay2 => {
        const q = await open({ relay: relay2 });
        await q.click("#btnTitleJoin");
        const msgs = [];
        for (let i = 1; i <= 4; i++) {
          await q.fill("#joinCode", "nosuch-00" + i); await q.click("#btnLookup");
          await q.waitForFunction(n => document.getElementById("joinErr").hidden === false && document.getElementById("joinErr").dataset.n !== String(n), i - 1).catch(() => {});
          await q.waitForTimeout(500);
          msgs.push(await q.$eval("#joinErr", e => e.textContent));
        }
        r.check("the first wrong codes just say there is no exercise", msgs.slice(0, 3).every(m => /There is no exercise with that code/.test(m)), msgs.join(" | "));
        r.check("after the limit, the next says there were too many, and what to do", msgs[3] === "Too many codes that didn't match an exercise. Try again in an hour, or ask whoever set it up to check the code.", msgs[3]);
        await q.context().close();
      }, { fresh: true, vars: { WRONG_CODE_LIMIT: "3" } });

      // ---- joining ----
      await j.fill("#joinCode", code.toUpperCase()); await j.click("#btnLookup");
      await j.waitForSelector("#joinFound:not([hidden])");
      const sum = await j.$eval("#joinSummary", e => e.textContent);
      r.check("the joiner is told what the exercise is and who set it up", sum === "This exercise: two screens, simultaneous, 4 rounds. Set up by Team 1 (Ashwood County).", sum);
      const sides = await j.evaluate(() => ({ t1: document.getElementById("joinT1").disabled, t2: document.getElementById("joinT2").disabled, t1txt: document.getElementById("joinT1").textContent, t2on: document.getElementById("joinT2").classList.contains("on"), nm: document.getElementById("joinName").value }));
      r.check("Team 1 is shown as taken, Team 2 is chosen for them, and its name is filled in to change", sides.t1 && !sides.t2 && /taken/.test(sides.t1txt) && sides.t2on && sides.nm === "Team 2", JSON.stringify(sides));
      await j.fill("#joinName", "Calder County"); await j.click("#btnJoin");
      await j.waitForFunction(() => window.G && G.me, null, { timeout: 15000 });
      const g = await j.evaluate(() => ({ me: G.me, mode: G.mode, rounds: G.maxRounds, prec: G.revealPrec, ai: G.requireAI, durA: G.durA, durD: G.durD, clock: G.clockOn, deck: DECK_VERSION, first: DECK[0].title, n1: G.teams.t1.name, n2: G.teams.t2.name, code: G.joinCode, jur: G.jurisdiction, hint: document.getElementById("def_policy").placeholder }));
      r.check("the joiner started with the host's settings", g.me === "t2" && g.mode === "sim" && g.rounds === 4 && g.prec === false && g.ai === true && g.durA === 210 && g.durD === 255 && g.clock === true, JSON.stringify(g));
      r.check("...and the host's inject deck, though this screen never reached the library", g.deck === 7 && g.first === deckTitle, JSON.stringify([g.deck, g.first]));
      r.check("...and the host's jurisdiction, used in its response hint", g.jur === "Test County" && /Name the election office or Test County policy, procedure or plan/.test(g.hint), JSON.stringify([g.jur, g.hint]));
      r.check("the room's settings message carries the jurisdiction", st.j === "Test County", JSON.stringify(st.j));
      r.check("...and knows both team names", g.n1 === "Ashwood County" && g.n2 === "Calder County", JSON.stringify([g.n1, g.n2]));
      const hostSees = await until(async () => (await host.evaluate(() => G.teams.t2.name)) === "Calder County", 10000);
      r.check("the host's screen learns the joiner's team name", hostSees);
      r.check("...and hides the code banner, because everyone is in", await until(async () => await host.$eval("#joinBanner", e => e.hidden), 5000));
      r.check("random placement came from the host's setting: the joiner is past placement", await until(async () => !/place/.test(await screenOn(j)) && (await screenOn(j)) !== "screen-join", 8000), await screenOn(j));

      // ---- a saved host game keeps its code ----
      await host.reload(); await host.click("#btnTitleGo"); await host.click("#btnResume"); await host.waitForFunction(() => window.G && G.joinCode);
      r.check("a saved host game comes back with its code", (await host.evaluate(() => G.joinCode)) === code);

      // ---- a moderator hosts; two screens claim the same side ----
      const mod = await setupPage();
      await mod.click("#modeSim"); await mod.click("#sideMod"); await mod.selectOption("#rounds", "4"); await mod.check("#optAuto");
      await mod.fill("#jurisdiction", "Test County"); await mod.click("#btnStart"); await mod.waitForFunction(() => window.G && G.joinCode, null, { timeout: 15000 });
      const mcode = await mod.evaluate(() => G.joinCode);
      const mb = () => mod.$eval("#joinBanner", e => e.hidden ? "" : e.textContent);
      r.check("a moderator host's banner waits for both teams", /Waiting for Team 1 and Team 2 to join\./.test(await mb()), await mb());
      const a = await open(), b = await open();
      const prep = async (p, side) => { await p.click("#btnTitleJoin"); await p.fill("#joinCode", mcode); await p.click("#btnLookup"); await p.waitForSelector("#joinFound:not([hidden])"); await p.click(side === "t1" ? "#joinT1" : "#joinT2"); };
      const sm = await a.$eval("#joinSummary", e => e.textContent).catch(() => "");
      await prep(a, "t1"); await prep(b, "t1");
      r.check("with a moderator host, both Team 1 and Team 2 are open to choose", /Set up by the moderator\./.test(await a.$eval("#joinSummary", e => e.textContent)) && !(await a.$eval("#joinT1", e => e.disabled)) && !(await a.$eval("#joinT2", e => e.disabled)));
      await a.fill("#joinName", "Alpha County"); await b.fill("#joinName", "Beta County");
      await Promise.all([a.click("#btnJoin"), b.click("#btnJoin")]);
      await until(async () => (await a.evaluate(() => !!(window.G && G.me))) || (await b.evaluate(() => !!(window.G && G.me))), 15000);
      await new Promise(r2 => setTimeout(r2, 1500));
      const inA = await a.evaluate(() => !!(window.G && G.me)), inB = await b.evaluate(() => !!(window.G && G.me));
      r.check("two screens choosing Team 1 at once: exactly one gets in", inA !== inB, JSON.stringify([inA, inB]));
      const loser = inA ? b : a, winner = inA ? a : b;
      const lmsg = await loser.$eval("#joinErr", e => e.hidden ? "" : e.textContent);
      r.check("the other is told Team 1 is taken and to choose the other side", /Team 1 is already taken by another screen\. Choose the other side\./.test(lmsg), lmsg);
      r.check("...and Team 1 now shows as taken, Team 2 is chosen for them", (await loser.$eval("#joinT1", e => e.disabled)) && (await loser.$eval("#joinT2", e => e.classList.contains("on"))));
      await loser.fill("#joinName", "Gamma County"); await loser.click("#btnJoin");
      await loser.waitForFunction(() => window.G && G.me, null, { timeout: 15000 });
      const wname = await winner.evaluate(() => G.teams.t1.name);
      const seen = await until(async () => (await mod.evaluate(() => G.teams.t1.name)) === wname && (await mod.evaluate(() => G.teams.t2.name)) === "Gamma County", 12000);
      r.check("the moderator sees both team names", seen, await mod.evaluate(() => JSON.stringify([G.teams.t1.name, G.teams.t2.name])));
      r.check("...and the moderator's banner goes away", await until(async () => (await mb()) === "", 5000));
      r.check("the moderator's screen shows no board and the teams played on", (await screenOn(mod)) === "screen-mod");
      const ok = await until(async () => (await winner.evaluate(() => G.teams.t2.name)) === "Gamma County", 10000);
      r.check("the team that won Team 1 learns the other team's name too", ok);

      // ---- a used room is skipped ----
      {
        const tag = Date.now(), taken = "taken-" + tag, fresh = "fresh-" + tag;   // unique per run: a local relay keeps its rooms between runs
        await fetch(relay + "/room/" + taken + "/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from: "t1", code: "R1-MSG", note: "hi" }) });
        const p = await setupPage();
        await p.evaluate(([a, b]) => { let n = 0; window.genJoinCode = () => (n++ === 0 ? a : b); }, [taken, fresh]);
        await p.click("#modeSim"); await p.click("#sideT1"); await p.check("#optAuto"); await p.fill("#jurisdiction", "Test County"); await p.click("#btnStart");
        await p.waitForFunction(() => window.G && G.joinCode, null, { timeout: 15000 });
        r.check("a code whose room already has messages is not used; the next is", (await p.evaluate(() => G.joinCode)) === fresh);
        r.check("the words the codes are made of are lower-case, plain and not repeated", await p.evaluate(() => JOIN_WORDS.length >= 200 && new Set(JOIN_WORDS).size === JOIN_WORDS.length && JOIN_WORDS.every(w => /^[a-z]{3,9}$/.test(w))));
      }

      // ---- the relay's rule ----
      const send = (from, code) => fetch(relay + "/room/rule-" + Date.now() + "/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ from, code, note: "{}" }) }).then(x => x.status);
      r.check("the relay lets a moderator post the exercise's settings, but not an attack, a response or a join", (await send("mod", "R0-SETUP")) === 200 && (await send("mod", "R1-04-C4")) === 400 && (await send("mod", "R0-JOIN")) === 400);
      r.check("no JavaScript errors on any screen", errors.length === 0, errors.join("; "));
    });
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
