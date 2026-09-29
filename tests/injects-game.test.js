/*
  The game and the editor page working with the inject library (build 12), against a local library.

  The game:
    - reads the library's deck and says so on the setup screen; a game uses that deck from its start
    - keeps that deck for the whole game: an edit made later doesn't change it, even after a reload
    - if the library can't be reached, or sends something the game's own checks refuse (a made-up type,
      a javascript: link), the game uses the built-in deck and still plays
    - text typed into an inject is shown as plain text, never run as a page
    - two screens with different decks each say so; two with the same deck say nothing
  The editor page:
    - lists the injects, edits one, saves it, and the game's deck changes
    - reorders and chooses the starting inject; adds and deletes; shows a footprint picture
    - shows History, says what changed, and restores an old version
    - says what is wrong when a save is refused, and when someone else saved first
*/
const { reporter, withRelay, withInjects, launch, setupScreens, screenOn } = require("./helpers");
const { PAGE } = require("./helpers");

const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
const clone = o => JSON.parse(JSON.stringify(o));

(async () => {
  const r = reporter("Inject library with the game and the editor page");
  let browser;
  try {
    await withInjects(async (lib, token) => {
      await withRelay(async relay => {
        browser = await launch();
        const E = lib + "/api/edit/" + token + "/";
        const getDeck = () => fetch(lib + "/api/deck").then(x => x.json());
        const save = async (mutate, summary) => { const d = await getDeck(); const inj = clone(d.injects); mutate(inj, d); const x = await fetch(E + "save", { method: "POST", body: JSON.stringify({ base: d.version, start: d.start, injects: inj, summary }) }); return x.json(); };
        const openGame = async (url, opts) => {
          const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
          await ctx.addInitScript(u => { window.BALLOTSHIP_DECK_URL = u; }, url);
          const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.errs = errs;
          await p.goto(PAGE); await p.click("#btnTitleGo"); await p.click("#modePass");
          return p;
        };
        const startPass = async p => { if (!(await p.isChecked("#optAuto"))) await p.check("#optAuto"); await p.click("#btnStart"); await p.waitForTimeout(300); };
        const note = p => p.$eval("#deckNote", e => e.textContent);
        const deckNow = p => p.evaluate(() => ({ v: DECK_VERSION, n: DECK.length, start: DECK_START, t6: DECK[5].title, t1: DECK[0].title }));

        // ---- the game reads the library ----
        const s1 = await save(x => { x[0].title = "Edited first inject"; x[5].title = "<img src=x onerror=window.__pwned=1> Sixth"; }, "test edit");
        r.check("(setup) a test edit saved as version 2", s1.version === 2, JSON.stringify(s1));
        let p = await openGame(lib + "/api/deck");
        await until(async () => /library version/.test(await note(p)), 5000);
        r.check("the setup screen says which library version it will use", /library version 2 \(16 injects\)/.test(await note(p)), await note(p));
        await startPass(p);
        let d = await deckNow(p);
        r.check("a new game uses the library's deck (version 2, edited title)", d.v === 2 && d.t1 === "Edited first inject" && d.n === 16 && d.start === 6, JSON.stringify(d));
        await p.click("#btnGate"); await p.waitForTimeout(300);
        const shown = await p.evaluate(() => { const t = document.querySelector("#screen-offense .card-title"); return { text: t && t.textContent, img: !!document.querySelector("#screen-offense .card-title img"), pwned: window.__pwned }; });
        r.check("markup typed into an inject is shown as text and doesn't run", shown.text === "<img src=x onerror=window.__pwned=1> Sixth" && !shown.img && !shown.pwned, JSON.stringify(shown));

        // ---- the game keeps its deck ----
        await save(x => { x[0].title = "Edited AGAIN"; }, "second edit");
        await p.reload(); await p.waitForTimeout(300);
        await p.click("#btnTitleGo"); await p.click("#btnResume"); await p.waitForTimeout(300);
        d = await deckNow(p);
        r.check("an edit made during a game doesn't change it, even after a reload (still version 2)", d.v === 2 && d.t1 === "Edited first inject", JSON.stringify(d));
        r.check("no JavaScript errors", p.errs.length === 0, p.errs.join("; "));

        // ---- the library can't be reached ----
        p = await openGame("http://127.0.0.1:9/api/deck");
        await until(async () => /built-in/.test(await note(p)), 8000);
        r.check("library unreachable: the setup screen says the built-in set is used", /built-in set \(16 injects\).*couldn't be reached/.test(await note(p)), await note(p));
        await startPass(p); d = await deckNow(p);
        r.check("...and the game starts with the built-in deck", d.v === 0 && d.n === 16 && d.t1 === "Last-minute polling place relocation", JSON.stringify(d));
        await p.click("#btnGate"); await p.waitForTimeout(200);
        r.check("...and plays (the attack screen opened)", (await screenOn(p)) === "screen-offense");

        // ---- the library sends something the game refuses ----
        const good = await getDeck();
        const evil = async (name, mutate) => {
          const ctx = await browser.newContext(); const q = await ctx.newPage();
          const dk = clone(good); mutate(dk.injects);
          await q.route("**/evil-deck", route => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(dk) }));
          await ctx.addInitScript(() => { window.BALLOTSHIP_DECK_URL = "https://evil.test/evil-deck"; });
          await q.goto(PAGE); await q.click("#btnTitleGo");
          await until(async () => /built-in|library version/.test(await q.$eval("#deckNote", e => e.textContent)), 8000);
          const t = await q.$eval("#deckNote", e => e.textContent);
          r.check("refused by the game: " + name + " (built-in set used)", /built-in set/.test(t), t);
        };
        await evil("an unknown type", i => { i[1].type = "Sneaky"; });
        await evil("a sponsor link that is javascript:", i => { i[2].sponsor.url = "javascript:alert(1)"; });
        await evil("text far too long", i => { i[3].scene = "x".repeat(5000); });
        await evil("too few injects", i => { i.length = 2; });

        // ---- two screens: same deck, different deck ----
        const same = await setupScreens(browser, relay, ["t1", "t2"], { pollMs: 300, deckUrls: { t1: lib + "/api/deck", t2: lib + "/api/deck" } });
        await new Promise(r2 => setTimeout(r2, 2500));
        const warn = pg => pg.$eval("#deckWarn", e => !e.hidden);
        r.check("two screens with the same deck: no warning", !(await warn(same.pages.t1)) && !(await warn(same.pages.t2)));
        const diff = await setupScreens(browser, relay, ["t1", "t2"], { pollMs: 300, deckUrls: { t1: lib + "/api/deck", t2: "" } });
        const both = await until(async () => (await warn(diff.pages.t1)) && (await warn(diff.pages.t2)), 15000);
        r.check("two screens with different decks: both warn", both);
        r.check("...saying which versions, and what to do", /version \d+/.test(await diff.pages.t1.$eval("#deckWarn", e => e.textContent)) && /start a new exercise/.test(await diff.pages.t2.$eval("#deckWarn", e => e.textContent)), await diff.pages.t2.$eval("#deckWarn", e => e.textContent));
        r.check("no JavaScript errors on the two-screen pages", same.errors.concat(diff.errors).length === 0, same.errors.concat(diff.errors).join("; "));

        // ---- the editor page ----
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const ed = await ctx.newPage(); const eerr = []; ed.on("pageerror", e => eerr.push(e.message)); ed.on("dialog", dlg => dlg.accept());
        const wrong = await ctx.newPage(); const wr = await wrong.goto(lib + "/edit/not-the-secret");
        r.check("the editor address with a wrong secret is not found", wr.status() === 404);
        await ed.goto(lib + "/edit/" + token); await ed.waitForSelector("#list li");
        const before = await getDeck();
        r.check("the editor lists every inject", (await ed.$$("#list li")).length === before.injects.length, "" + (await ed.$$("#list li")).length);
        r.check("the Ready for Tuesday name is on the page", /Ready for Tuesday/.test(await ed.$eval("header", e => e.textContent)));
        r.check("the starting inject is marked", (await ed.$$eval("#list li", els => els.findIndex(e => /Start/.test(e.querySelector(".badge") ? e.querySelector(".badge").textContent : "")))) === before.start - 1);
        r.check("Save is off until something changes", await ed.$eval("#btnSave", b => b.disabled));

        await ed.click("#list li:nth-child(2)");
        await ed.fill("#fld_title", "Second inject, retitled in the editor");
        r.check("typing in the title updates the list and turns Save on", (await ed.$eval("#list li:nth-child(2) .t", e => e.textContent)).startsWith("Second inject, retitled") && !(await ed.$eval("#btnSave", b => b.disabled)));
        await ed.fill("#fld_scene", "y".repeat(450));
        r.check("a text box over its limit says so", /450 \/ 400/.test(await ed.$eval("#cnt_fld_scene", e => e.textContent)) && await ed.$eval("#cnt_fld_scene", e => e.classList.contains("over")));
        await ed.fill("#summary", "Retitled the second one");
        await ed.click("#btnSave"); await ed.waitForFunction(() => /Not saved/.test(document.getElementById("status").textContent) || /Saved/.test(document.getElementById("status").textContent));
        r.check("a refused save says what to fix and shows the list", /Not saved/.test(await ed.$eval("#status", e => e.textContent)) && /401|450|scene/.test(await ed.$eval("#errs", e => e.textContent)), await ed.$eval("#status", e => e.textContent));
        r.check("...and the live deck was not changed", (await getDeck()).version === before.version);
        await ed.fill("#fld_scene", "A shorter scene.");
        await ed.click("#btnSave"); await ed.waitForFunction(() => /^Saved/.test(document.getElementById("status").textContent));
        let now = await getDeck();
        r.check("a good save goes live at once, with the title and scene", now.version === before.version + 1 && now.injects[1].title === "Second inject, retitled in the editor" && now.injects[1].scene === "A shorter scene.", JSON.stringify([now.version, now.injects[1].title]));

        // footprint picture, crisis
        await ed.selectOption("[data-k=shape]", "lineV3");
        r.check("the footprint picture shows the 3 squares of the chosen shape", (await ed.$$eval("#grid .on", e => e.length)) === 3);
        await ed.check("[data-k=crisis]");
        r.check("a crisis inject has no shape and says whole jurisdiction", /Whole jurisdiction/.test(await ed.$eval("#grid", e => e.textContent)) && await ed.$eval("[data-k=shape]", e => e.disabled));
        await ed.uncheck("[data-k=crisis]");

        // reorder + start
        await ed.click("#list li:nth-child(2) [data-a=dn]");
        r.check("moving an inject down changes its place in the list", (await ed.$eval("#list li:nth-child(3) .t", e => e.textContent)).startsWith("Second inject, retitled"));
        await ed.click("[data-a=start]");
        r.check("'make this the starting inject' moves the Start mark", (await ed.$eval("#list li:nth-child(3) .badge", e => e.textContent)) === "Start");
        await ed.click("#btnSave"); await ed.waitForFunction(() => /^Saved/.test(document.getElementById("status").textContent));
        now = await getDeck();
        r.check("the order and the starting inject are saved (start = 3, moved inject at 3)", now.start === 3 && now.injects[2].title.startsWith("Second inject, retitled"), JSON.stringify([now.start, now.injects[2].title]));

        // add and delete
        await ed.click("#btnAdd");
        r.check("adding puts a blank inject at the end, selected", (await ed.$$("#list li")).length === now.injects.length + 1 && (await ed.$eval("#list li.sel .t", e => e.textContent)).startsWith("New inject"));
        await ed.click("#btnSave"); await ed.waitForFunction(() => /Not saved/.test(document.getElementById("status").textContent));
        r.check("saving an unfinished new inject is refused (the empty boxes are named)", /can't be empty|is missing/.test(await ed.$eval("#status", e => e.textContent)), await ed.$eval("#status", e => e.textContent));
        await ed.click("[data-a=del]");
        r.check("deleting removes it from the list", (await ed.$$("#list li")).length === now.injects.length);

        // someone else saved first
        const cur = await getDeck();
        await ed.click("#list li:nth-child(1)"); await ed.fill("#fld_title", "Mine");
        await save(x => { x[3].title = "Theirs"; }, "someone else");
        await ed.click("#btnSave"); await ed.waitForFunction(() => /Not saved|Someone else/.test(document.getElementById("status").textContent));
        r.check("a save made after someone else's is refused, telling the editor to reload", /Someone else saved/.test(await ed.$eval("#status", e => e.textContent)) && (await getDeck()).injects[0].title !== "Mine", await ed.$eval("#status", e => e.textContent));
        await ed.reload(); await ed.waitForSelector("#list li");

        // history
        await ed.click("#btnHist"); await ed.waitForSelector("#hist table");
        const rows = await ed.$$eval("#hist tr", t => t.length);
        r.check("History lists the versions with what each did", rows > 4 && /Retitled the second one/.test(await ed.$eval("#hist", e => e.textContent)));
        await ed.click("#hist [data-a=chg][data-v='3']"); await ed.waitForFunction(() => { const t = document.querySelector("#hist [data-a=chg][data-v='3']").closest("tr").nextElementSibling; return !t.hidden && t.textContent.length > 0; });
        const dtext = await ed.$eval("#hist [data-a=chg][data-v='3']", b => b.closest("tr").nextElementSibling.textContent);
        r.check("'What changed' names the inject and the fields that changed", /changed/.test(dtext) && /title/.test(dtext), dtext);
        const listBefore = await getDeck();
        await ed.click("#hist [data-a=rest][data-v='1']"); await ed.waitForFunction(() => /^Restored/.test(document.getElementById("status").textContent));
        now = await getDeck();
        r.check("Restore makes version 1 live again as a new version", now.version === listBefore.version + 1 && now.injects[0].title === "Last-minute polling place relocation" && now.start === 6 && now.injects.length === 16, JSON.stringify([now.version, now.injects[0].title, now.start]));
        r.check("no JavaScript errors on the editor page", eerr.length === 0, eerr.join("; "));
      });
    });
  } catch (e) { r.fail("test crashed", e.message); console.log(e.stack); }
  finally { if (browser) await browser.close(); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
