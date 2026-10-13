/*
  Backup & Restore for the inject library (build 24), against a local library with an empty store, never the real one.

  The editor page:
    - before any backup the banner is red and says no backup has been taken, with "Back up now", which goes to the
      Backup & Restore section; the section has the standard's help text, responsibility line and restore warning
    - Backup downloads ballotship-injects-backup-ready-for-tuesday-YYYY-MM-DD-HH-MM-SS-UTC.json holding the live deck;
      the banner turns green and the line says "just now by" the signed-in address
    - a day and a half later the banner is yellow, four days later red, both with "Back up now" (the page's clock is moved)
    - restoring a file from another tool says so and changes nothing; cancelling the confirm changes nothing; the confirm
      names the date, who took it and the counts; confirming makes the file's deck live as a new version
  The server:
    - backup, the stamp and restore all refuse without a sign-in, and from another website's page
    - the file has the standard's metadata and nothing secret (no tokens, sessions, cookie or mail key)
    - the stamp only moves forwards: a backup reported as taken earlier than the current stamp leaves it alone, and a
      time in the future is not believed
    - a wrong file, a damaged file, a newer-format file and a deck that fails the checks are refused with what to do,
      and change nothing; a check-only request changes nothing
    - an older file (the plain deck from /api/deck, with no app or format number, and an inject missing its precedent
      source) restores
    - a restore from an out-of-date page is refused (409), like a save
    - a restore becomes a new version that says it came from a file, and the deck it replaced stays in History
    - extra fields in a file (a sessions list, a version of its own) are ignored, and sign-ins survive a restore
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const { reporter, withInjects, launch } = require("./helpers");

const clone = o => JSON.parse(JSON.stringify(o));
const DAY = 86400000;

(async () => {
  const r = reporter("Inject library backup and restore");
  let browser;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ballotship-backup-"));
  try {
    await withInjects(async (base, mail) => {
      const E = base + "/api/edit/";
      const cookie = await mail.signIn("keeper@readyfortuesday.com");
      const other = await mail.signIn("second@decaro.net");
      const call = async (p, body, opts) => {
        opts = opts || {};
        const headers = { "content-type": "application/json", ...(opts.cookie === null ? {} : { cookie: opts.cookie || cookie }), ...(opts.headers || {}) };
        const x = await fetch(E + p, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
        return { status: x.status, j: await x.json().catch(() => null), text: "" };
      };
      const getDeck = () => fetch(base + "/api/deck").then(x => x.json());

      // ---------------- the editor page ----------------
      browser = await launch();
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
      const [name, value] = cookie.split("=");
      await ctx.addCookies([{ name, value, url: base }]);
      const ed = await ctx.newPage(); const eerr = []; ed.on("pageerror", e => eerr.push(e.message));
      let dialogText = "", dialogAnswer = true;
      ed.on("dialog", d => { dialogText = d.message(); dialogAnswer ? d.accept() : d.dismiss(); });
      await ed.goto(base + "/edit"); await ed.waitForSelector("#list li");
      await ed.waitForFunction(() => /No backup/.test(document.getElementById("bkBanner").textContent));
      r.check("before any backup the banner is red, says none has been taken, and offers Back up now",
        await ed.$eval("#bkBanner", e => e.classList.contains("danger") && /No backup has ever been taken/.test(e.textContent) && !!e.querySelector("#bkNow")));
      const sec = await ed.$eval("#backup", e => e.textContent.replace(/\s+/g, " "));
      r.check("the section has the standard's help text and responsibility line, word for word",
        sec.includes("Keep this somewhere safe — anyone with the file can restore it into this system.") &&
        sec.includes("You are responsible for keeping your own backups. Take one before and after every election and after any big change."), sec);
      r.check("...and the restore warning, saying truthfully that the replaced deck stays in History",
        sec.includes("Warning: restoring replaces all current data in this system with the contents of the backup file. The deck it replaces stays in History, so you can restore it from there.") && !/cannot be undone/.test(sec), sec);
      r.check("the Ready for Tuesday name is still on the editor", /Ready for Tuesday/.test(await ed.$eval("header", e => e.textContent)));
      await ed.click("#bkNow");
      await ed.waitForTimeout(600);
      r.check("Back up now goes to the Backup & Restore section", await ed.evaluate(() => document.activeElement.id === "btnBackup" && document.getElementById("backup").getBoundingClientRect().top < innerHeight));

      const [dl] = await Promise.all([ed.waitForEvent("download"), ed.click("#btnBackup")]);
      const fname = dl.suggestedFilename();
      const saved = path.join(tmp, fname); await dl.saveAs(saved);
      const file = JSON.parse(fs.readFileSync(saved, "utf8"));
      r.check("Backup downloads ballotship-injects-backup-ready-for-tuesday-<date and time>-UTC.json", /^ballotship-injects-backup-ready-for-tuesday-\d{4}-\d\d-\d\d-\d\d-\d\d-\d\d-UTC\.json$/.test(fname), fname);
      r.check("...whose time is the file's savedAt, in UTC", fname.includes(file.savedAt.slice(0, 19).replace("T", "-").replace(/:/g, "-")), fname + " / " + file.savedAt);
      await ed.waitForFunction(() => document.getElementById("bkBanner").classList.contains("ok"));
      r.check("after a backup the banner is green with no Back up now, and names who took it",
        await ed.$eval("#bkBanner", e => /Last backup: just now by keeper@readyfortuesday\.com/.test(e.textContent) && !e.querySelector("#bkNow")), await ed.$eval("#bkBanner", e => e.textContent));
      r.check("the Last backup line under the button says the same and that it is shared", /Last backup: just now by keeper@readyfortuesday\.com — shared across everyone/.test(await ed.$eval("#bkLast", e => e.textContent)));

      // the colours at a day and a half and at four days (the page's clock is moved; the server's stamp is real)
      for (const [days, cls, label] of [[1.5, "warn", "yellow"], [4, "danger", "red"]]) {
        const p = await ctx.newPage();
        await p.clock.setFixedTime(new Date(Date.now() + days * DAY));
        await p.goto(base + "/edit"); await p.waitForSelector("#list li");
        await p.waitForFunction(c => document.getElementById("bkBanner").classList.contains(c), cls);
        r.check(days + " days after the last backup the banner is " + label + " with Back up now", await p.$eval("#bkBanner", (e, n) => !!e.querySelector("#bkNow") && new RegExp("Last backup: " + n + " days? ago by ").test(e.textContent), Math.floor(days)), await p.$eval("#bkBanner", e => e.textContent));
        await p.close();
      }

      // restore: a wrong file, a cancel, then the real thing
      const v0 = (await getDeck()).version;
      const wrong = path.join(tmp, "adventure-backup.json");
      fs.writeFileSync(wrong, JSON.stringify({ app: "election-adventure", schemaVersion: 1, injects: [] }));
      await ed.setInputFiles("#bkFile", wrong); await ed.click("#btnRestoreFile");
      await ed.waitForFunction(() => /different tool/.test(document.getElementById("bkMsg").textContent));
      r.check("a backup from another tool is refused, says so, and changes nothing", (await getDeck()).version === v0 && /Nothing was changed/.test(await ed.$eval("#bkMsg", e => e.textContent)));
      const junk = path.join(tmp, "notes.json"); fs.writeFileSync(junk, "this is not JSON");
      await ed.setInputFiles("#bkFile", junk); await ed.click("#btnRestoreFile");
      await ed.waitForFunction(() => /can't be read/.test(document.getElementById("bkMsg").textContent));
      r.check("a file that isn't JSON at all is refused and changes nothing", (await getDeck()).version === v0);

      // change the live deck so the restore has something to put back
      const d1 = await getDeck(); const changed = clone(d1.injects); changed[0].title = "Changed after the backup"; changed.pop();
      await call("save", { base: d1.version, injects: changed, summary: "changed after the backup" });
      await ed.reload(); await ed.waitForSelector("#list li");
      const v1 = (await getDeck()).version;
      dialogAnswer = false;
      await ed.setInputFiles("#bkFile", saved); await ed.click("#btnRestoreFile");
      await ed.waitForFunction(() => /Nothing was changed/.test(document.getElementById("bkMsg").textContent));
      r.check("the confirm names when the file was taken, by whom, and what it holds", /Taken: .+ by keeper@readyfortuesday\.com/.test(dialogText) && /It holds: 16 injects, 2 of them crisis, 1 with a sponsor/.test(dialogText) && /now version \d+, 15 injects/.test(dialogText), dialogText);
      r.check("cancelling it changes nothing", (await getDeck()).version === v1);
      dialogAnswer = true;
      await ed.click("#btnRestoreFile");
      await ed.waitForFunction(() => /^Restored/.test(document.getElementById("bkMsg").textContent));
      const after = await getDeck();
      r.check("confirming makes the file's deck live, as a new version", after.version === v1 + 1 && after.injects.length === 16 && JSON.stringify(after.injects) === JSON.stringify(file.injects), after.version + " " + after.injects.length);
      r.check("...and the editor shows the restored deck", (await ed.$$("#list li")).length === 16 && (await ed.$eval("#list li:nth-child(1) .t", e => e.textContent)) !== "Changed after the backup");
      r.check("no JavaScript errors on the editor page", eerr.length === 0, eerr.join("; "));

      // ---------------- the server ----------------
      const anon = { cookie: null };
      r.check("without a sign-in: backup, the stamp, a check and a restore are all refused",
        (await call("backup", {}, anon)).status === 401 && (await call("backup-status", undefined, anon)).status === 401 &&
        (await call("restore-file", { check: true, backup: file }, anon)).status === 401 && (await call("restore-file", { base: after.version, backup: file }, anon)).status === 401);
      r.check("...and nothing changed", (await getDeck()).version === after.version);
      const evil = { headers: { origin: "https://evil.example" } };
      r.check("from another website's page, backup and restore are refused even when signed in",
        (await call("backup", {}, evil)).status === 403 && (await call("restore-file", { base: after.version, backup: file }, evil)).status === 403);
      r.check("backup must be asked for with POST (a link or an image tag can't take one)", (await call("backup")).status === 405);

      const bk = await call("backup", { takenAt: Date.now() });
      const f = bk.j.backup;
      r.check("the file starts with app, schemaVersion, appVersion, savedAt (ISO UTC) and savedBy",
        JSON.stringify(Object.keys(f).slice(0, 5)) === JSON.stringify(["app", "schemaVersion", "appVersion", "savedAt", "savedBy"]) &&
        f.app === "ballotship-injects" && f.schemaVersion === 1 && /^build \d+$/.test(f.appVersion) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(f.savedAt) && f.savedBy === "keeper@readyfortuesday.com", JSON.stringify(Object.keys(f)));
      r.check("...then the deck (its version and every inject in play order) and nothing else",
        JSON.stringify(Object.keys(f).slice(5)) === JSON.stringify(["deckVersion", "deckSavedAt", "deckSummary", "injects"]) && f.deckVersion === after.version && JSON.stringify(f.injects) === JSON.stringify(after.injects));
      const raw = JSON.stringify(bk.j);
      const secrets = [cookie.split("=")[1], other.split("=")[1], "re_test_key", "bs_session", "RESEND"];
      r.check("nothing secret is in it (no sign-in cookie, token, session, hash or mail key)", secrets.every(s => !raw.toLowerCase().includes(s.toLowerCase())), secrets.filter(s => raw.toLowerCase().includes(s.toLowerCase())).join(", "));

      // the stamp only moves forwards
      const s0 = (await call("backup-status")).j;
      r.check("the stamp is shared: another editor sees who took the last backup", (await call("backup-status", undefined, { cookie: other })).j.by === "keeper@readyfortuesday.com" && s0.at === f.savedAt, JSON.stringify(s0));
      const late = await call("backup", { takenAt: Date.parse(s0.at) - 60000 }, { cookie: other });
      const s1 = (await call("backup-status")).j;
      r.check("a backup taken earlier than the current stamp (a slow request) leaves the stamp alone", late.status === 200 && s1.at === s0.at && s1.by === s0.by && late.j.last.by === s0.by, JSON.stringify([s0, s1]));
      const future = await call("backup", { takenAt: Date.now() + 10 * DAY }, { cookie: other });
      const s2 = (await call("backup-status")).j;
      r.check("a 'taken at' in the future is not believed (the server's own time is used)", Date.parse(s2.at) <= Date.now() + 1000 && s2.by === "second@decaro.net" && future.j.backup.savedAt === s2.at, JSON.stringify(s2));
      const ancient = await call("backup", { takenAt: Date.now() - 2 * DAY });
      const s3 = (await call("backup-status")).j;
      r.check("a 'taken at' days old is not believed either, and the newer backup wins", Date.now() - Date.parse(s3.at) < 60000 && Date.parse(s3.at) >= Date.parse(s2.at) && s3.by === "keeper@readyfortuesday.com" && ancient.status === 200, JSON.stringify([s2, s3]));

      // what a restore refuses (each checked twice: as a check, and as a real restore)
      const vNow = (await getDeck()).version;
      const refuse = async (label, backup, re) => {
        const c = await call("restore-file", { check: true, backup });
        const x = await call("restore-file", { base: vNow, backup });
        const v = (await getDeck()).version;
        r.check("refused: " + label, c.status === 422 && x.status === 422 && re.test(x.j.error) && /Nothing was changed|nothing was changed/.test(x.j.error) && v === vNow, x.status + " " + (x.j && x.j.error));
      };
      await refuse("a backup from another tool", { app: "poll-worker-management", schemaVersion: 1, injects: f.injects }, /different tool \(it says poll-worker-management\)/);
      await refuse("a file that isn't a backup at all", { hello: "world" }, /no injects/);
      await refuse("a list instead of a backup", [1, 2, 3], /isn't a backup/);
      await refuse("a file from a newer version", { ...f, schemaVersion: 2 }, /newer version/);
      await refuse("a damaged format number", { ...f, schemaVersion: "one" }, /damaged/);
      await refuse("an inject library backup with its format number missing", (() => { const g = { ...f }; delete g.schemaVersion; return g; })(), /damaged/);
      await refuse("a deck that fails the checks (a sponsor link that is javascript:)", (() => { const g = clone(f); g.injects[2].sponsor.url = "javascript:alert(1)"; return g; })(), /https/);
      await refuse("an inject with a field the library doesn't know", (() => { const g = clone(f); g.injects[0].onclick = "x"; return g; })(), /unexpected field/);
      await refuse("an inject hiding its fields behind __proto__", (() => { const g = JSON.parse(JSON.stringify(f).replace('{"id":"' + f.injects[1].id + '"', '{"__proto__":' + JSON.stringify(f.injects[1]) + ',"id":"' + f.injects[1].id + '"')); return g; })(), /unexpected field '__proto__'/);
      r.check("...and a check:\"yes\" (not exactly true) is still only a check", (await call("restore-file", { check: "yes", base: vNow, backup: f })).j.version === undefined && (await getDeck()).version === vNow);
      await refuse("too few injects", { ...f, injects: f.injects.slice(0, 3) }, /at least 4/);
      r.check("a check on a good file says what it holds and changes nothing",
        await call("restore-file", { check: true, backup: f }).then(x => x.status === 200 && x.j.info.count === 16 && x.j.info.crisis === 2 && x.j.info.savedBy === "keeper@readyfortuesday.com") && (await getDeck()).version === vNow);
      const stale = await call("restore-file", { base: vNow - 1, backup: f });
      r.check("a restore from an out-of-date page is refused, saying what to do, and changes nothing", stale.status === 409 && /Reload/.test(stale.j.error) && (await getDeck()).version === vNow, JSON.stringify(stale));
      r.check("a restore with no file is refused politely", (await call("restore-file", { base: vNow })).status === 422 && (await call("restore-file", "nope")).status === 400);

      // an older file: what /api/deck gives (no app, no format number), with one inject missing its precedent source
      const plain = await getDeck(); const older = clone(plain); older.injects = clone(f.injects).reverse(); delete older.injects[0].src; delete older.injects[1].ai; older.start = 6;
      const ck = await call("restore-file", { check: true, backup: older });
      r.check("an older file (the plain deck, no app or format number, missing fields) passes the check as format 0", ck.status === 200 && ck.j.info.schemaVersion === 0 && ck.j.info.savedAt === null, JSON.stringify(ck.j));
      const ro = await call("restore-file", { base: plain.version, backup: older });
      const now = await getDeck();
      r.check("...and restores, with safe defaults for what it lacks", ro.status === 200 && now.version === plain.version + 1 && now.injects[0].src === "" && now.injects[0].id === f.injects[15].id && now.start === undefined, JSON.stringify(ro));

      // a full file with extra fields; History; sign-ins survive
      const extra = { ...f, sessions: [{ hash: "x", email: "intruder@evil.example", expires: 9e15 }], tokens: ["y"], version: 999 };
      const rx = await call("restore-file", { base: now.version, backup: extra });
      const fin = await getDeck();
      const h = (await call("history")).j;
      r.check("a restore is a new version that says it came from a file, by whom it was taken and who restored it",
        rx.status === 200 && fin.version === now.version + 1 && /^Restored from a backup file taken \d{4}-\d\d-\d\d \d\d:\d\d UTC by keeper@readyfortuesday\.com$/.test(h[0].summary) && h[0].by === "keeper@readyfortuesday.com", JSON.stringify(h[0]));
      r.check("...the deck it replaced stays in History, and can be restored from there",
        h[1].version === now.version && (await call("restore", { version: now.version })).status === 200 && (await getDeck()).injects[0].id === f.injects[15].id);
      r.check("extra fields in a file (sessions, tokens, a version of its own) are ignored", fin.version !== 999 && JSON.stringify(fin.injects) === JSON.stringify(f.injects));
      r.check("sign-ins survive a restore (the current secrets are kept)", (await call("backup-status")).status === 200 && (await call("backup-status", undefined, { cookie: other })).status === 200);
      r.check("a file too large to be a backup is refused before it is read", await fetch(E + "restore-file", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ base: 1, backup: { injects: [], pad: "x".repeat(600000) } }) }).then(x => x.status === 413));
    });
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  finally { if (browser) await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
