/*
  The inject library's server (build 12): what it serves, who may change it, and what it refuses.
  Uses a local copy (withInjects) with an empty store, never the real library.

    - it starts from the 16 injects that were built into the game, in their order (the first one starts a game)
    - reading the deck is public; the editor page is at /edit and editing needs a sign-in (build 15; the sign-in
      itself is tested in injects-auth.test.js), and a save sent from another website's page is refused even when
      signed in
    - a good save is numbered, kept in History, and is what the next read returns
    - a save made from an out-of-date copy is refused (two people editing at once), and changes nothing
    - a bad deck is refused with a message that says what to fix, and changes nothing: an unknown
      type, text too long, a crisis inject with a footprint, a sponsor link that isn't https (including
      javascript:), a repeated id, too few injects, a stray field
    - restoring an old version makes it live again as a NEW version, so history never loses anything
    - the copy of the injects that the server starts from matches index.html (node injects/tools/extract.js --check)
*/
const { spawnSync } = require("child_process");
const path = require("path");
const { reporter, withInjects, ROOT } = require("./helpers");

(async () => {
  const r = reporter("Inject library server");
  const ex = spawnSync(process.execPath, [path.join(ROOT, "injects", "tools", "extract.js"), "--check"], { encoding: "utf8" });
  r.check("the server's starting copy of the injects matches index.html", ex.status === 0, ex.stderr + ex.stdout);
  try {
    await withInjects(async (base, mail) => {
      const E = base + "/api/edit/";
      const cookie = await mail.signIn("tester@readyfortuesday.com");   // build 15: every editing call needs the sign-in (tested in injects-auth.test.js)
      const get = async u => { const x = await fetch(u, { headers: { cookie } }); return { status: x.status, j: await x.json().catch(() => null) }; };
      const post = async (p, body, headers) => { const x = await fetch(E + p, { method: "POST", headers: { "content-type": "application/json", cookie, ...(headers || {}) }, body: JSON.stringify(body) }); return { status: x.status, j: await x.json().catch(() => null) }; };
      const clone = o => JSON.parse(JSON.stringify(o));

      const d = (await get(base + "/api/deck")).j;
      r.check("the deck starts as the 16 built-in injects, in their own order, version 1, with no starting position", d.injects.length === 16 && d.version === 1 && d.start === undefined && d.injects[0].id === "i01", d.injects.length + " start " + d.start + " v" + d.version);
      r.check("the deck can be read without any secret", (await get(base + "/api/deck")).status === 200);
      r.check("the editor page is at the plain address /edit (it shows a sign-in box until you are signed in)", (await fetch(base + "/edit")).status === 200 && /inject library/.test(await (await fetch(base + "/edit")).text()));
      r.check("the old secret-style address is gone (/edit/anything is not found)", (await fetch(base + "/edit/anything")).status === 404 && (await get(base + "/api/edit/anything/history")).status === 404);
      const cross = await post("save", { base: 1, injects: d.injects, summary: "from elsewhere" }, { origin: "https://evil.example" });
      r.check("a save sent from another website's page is refused", cross.status === 403 && (await get(base + "/api/deck")).j.version === 1, JSON.stringify(cross));
      const save = (deck, base_, summary, hdr) => post("save", { base: base_, injects: deck.injects, summary }, hdr);
      let x = clone(d.injects); x[0].title = "Edited title";
      let s = await save({ injects: x }, 1, "Reworded inject 1", { origin: base });   // as the editor page sends it
      r.check("a good save from the editor's own site returns the next version", s.status === 200 && s.j.version === 2, JSON.stringify(s));
      const after = (await get(base + "/api/deck")).j;
      r.check("...and the deck now shows the edit", after.version === 2 && after.injects[0].title === "Edited title");

      s = await save({ injects: x }, 1, "stale");
      r.check("a save from an out-of-date copy is refused, saying what to do", s.status === 409 && /Reload/.test(s.j.error), JSON.stringify(s));

      const bad = async (name, mutate, expect) => {
        const y = clone(after.injects);
        const o = mutate(y); const inj = (o && o.injects) || y;
        const res = await save({ injects: inj }, 2, "bad");
        const now = (await get(base + "/api/deck")).j;
        r.check("refused: " + name, res.status === 422 && expect.test(res.j.error || "") && now.version === 2, res.status + " " + (res.j && res.j.error));
      };
      await bad("an unknown type", y => { y[1].type = "Sneaky"; }, /type/);
      await bad("an unknown category", y => { y[1].cat = "Z"; }, /category/);
      await bad("text over the limit", y => { y[1].scene = "x".repeat(401); }, /401 characters/);
      await bad("an empty title", y => { y[1].title = "  "; }, /title/);
      await bad("a crisis inject that has a footprint", y => { y[2].shape = "single"; }, /crisis/);
      await bad("an inject with no footprint that isn't a crisis", y => { delete y[0].shape; }, /shape/);
      await bad("a sponsor link that is javascript:", y => { y[2].sponsor.url = "javascript:alert(1)"; }, /https/);
      await bad("a sponsor logo that is plain http", y => { y[2].sponsor.logo = "http://example.com/a.png"; }, /https/);
      await bad("a repeated id", y => { y[1].id = y[0].id; }, /used twice/);
      await bad("too few injects", y => ({ injects: y.slice(0, 3) }), /at least 4/);
      await bad("a stray field", y => { y[1].onclick = "x"; }, /unexpected field/);
      await bad("HTML-looking text is kept as text, but control characters are refused", y => { y[1].title = "bad\u0001title"; }, /control character/);
      const noAi = clone(after.injects); delete noAi[4].ai; noAi[5].ai = { task: "", prompt: "" };
      r.check("an inject may have no AI assignment, or an empty one (a game can run without it)", (await save({ injects: noAi }, 2, "no ai")).status === 200);
      const noAi2 = (await get(base + "/api/deck")).j;
      r.check("...and one whose AI text is too long is still refused", (await (async () => { const y = clone(noAi2.injects); y[0].ai = { task: "x".repeat(401), prompt: "" }; return (await save({ injects: y }, noAi2.version, "long ai")).status; })()) === 422);
      const html = clone((await get(base + "/api/deck")).j.injects); html[3].title = "<img src=x onerror=alert(1)>";
      s = await save({ injects: html }, (await get(base + "/api/deck")).j.version, "html as text");
      r.check("markup typed into a title is accepted as plain text (it is always escaped when shown)", s.status === 200, JSON.stringify(s));

      const h = (await get(E + "history")).j;
      r.check("history lists every save, newest first", h.length === 4 && h[0].version === 4 && h[2].summary === "Reworded inject 1" && h[3].version === 1, JSON.stringify(h.map(v => v.version)));
      r.check("history says who made each save (by the signed-in address)", h[0].by === "tester@readyfortuesday.com" && h[3].by === null, JSON.stringify(h.map(v => v.by)));
      const old = (await get(E + "version/1")).j;
      r.check("an old version can be read back whole", old.injects[0].title !== "Edited title" && old.injects.length === 16);
      s = await post("restore", { version: 1 });
      const restored = (await get(base + "/api/deck")).j;
      r.check("restoring version 1 makes it live as version 5, and 2 to 4 stay in history", s.status === 200 && restored.version === 5 && restored.injects[0].title === old.injects[0].title && (await get(E + "history")).j.length === 5, JSON.stringify(s));
      r.check("restoring a version that doesn't exist says so", (await post("restore", { version: 99 })).status === 404);
      r.check("a save that isn't JSON is refused politely", await fetch(E + "save", { method: "POST", headers: { cookie }, body: "nope" }).then(x => x.status === 400));
    });
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
