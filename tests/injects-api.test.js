/*
  The inject library's server (build 12): what it serves, who may change it, and what it refuses.
  Uses a local copy (withInjects) with an empty store, never the real library.

    - it starts from the 16 injects that were built into the game, starting at the sixth
    - reading is public; the editor page and every change need the secret in the address
    - a good save is numbered, kept in History, and is what the next read returns
    - a save made from an out-of-date copy is refused (two people editing at once), and changes nothing
    - a bad deck is refused with a message that says what to fix, and changes nothing: an unknown
      type, text too long, a crisis inject with a footprint, a sponsor link that isn't https (including
      javascript:), a repeated id, too few injects, a start position that doesn't exist, a stray field
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
    await withInjects(async (base, token) => {
      const E = t => base + "/api/edit/" + t + "/";
      const get = async u => { const x = await fetch(u); return { status: x.status, j: await x.json().catch(() => null) }; };
      const post = async (p, body, t) => { const x = await fetch(E(t || token) + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: x.status, j: await x.json().catch(() => null) }; };
      const clone = o => JSON.parse(JSON.stringify(o));

      const d = (await get(base + "/api/deck")).j;
      r.check("the deck starts as the 16 built-in injects, from the sixth, version 1", d.injects.length === 16 && d.start === 6 && d.version === 1, d.injects.length + " start " + d.start + " v" + d.version);
      r.check("the deck can be read without any secret", (await get(base + "/api/deck")).status === 200);
      r.check("editing is closed without the secret: history, save, restore", (await get(E("wrong") + "history")).status === 404 && (await post("save", { base: 1 }, "wrong")).status === 404 && (await post("restore", { version: 1 }, "wrong")).status === 404);
      r.check("the editor page is only served with the secret", (await fetch(base + "/edit/wrong")).status === 404 && (await fetch(base + "/edit/" + token)).status === 200);

      const save = (deck, base_, summary) => post("save", { base: base_, start: deck.start, injects: deck.injects, summary });
      let x = clone(d.injects); x[0].title = "Edited title";
      let s = await save({ start: 6, injects: x }, 1, "Reworded inject 1");
      r.check("a good save returns the next version", s.status === 200 && s.j.version === 2, JSON.stringify(s));
      const after = (await get(base + "/api/deck")).j;
      r.check("...and the deck now shows the edit", after.version === 2 && after.injects[0].title === "Edited title");

      s = await save({ start: 6, injects: x }, 1, "stale");
      r.check("a save from an out-of-date copy is refused, saying what to do", s.status === 409 && /Reload/.test(s.j.error), JSON.stringify(s));

      const bad = async (name, mutate, expect) => {
        const y = clone(after.injects); let start = 6;
        const o = mutate(y); if (o && o.start) start = o.start; const inj = (o && o.injects) || y;
        const res = await save({ start, injects: inj }, 2, "bad");
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
      await bad("too few injects", y => ({ injects: y.slice(0, 3), start: 1 }), /at least 4/);
      await bad("a starting inject that doesn't exist", () => ({ start: 17 }), /starting inject/);
      await bad("a stray field", y => { y[1].onclick = "x"; }, /unexpected field/);
      await bad("HTML-looking text is kept as text, but control characters are refused", y => { y[1].title = "bad\u0001title"; }, /control character/);
      const html = clone(after.injects); html[3].title = "<img src=x onerror=alert(1)>";
      s = await save({ start: 6, injects: html }, 2, "html as text");
      r.check("markup typed into a title is accepted as plain text (it is always escaped when shown)", s.status === 200, JSON.stringify(s));

      const h = (await get(E(token) + "history")).j;
      r.check("history lists every save, newest first", h.length === 3 && h[0].version === 3 && h[1].summary === "Reworded inject 1" && h[2].version === 1, JSON.stringify(h.map(v => v.version)));
      const old = (await get(E(token) + "version/1")).j;
      r.check("an old version can be read back whole", old.injects[0].title !== "Edited title" && old.injects.length === 16);
      s = await post("restore", { version: 1 }, token);
      const restored = (await get(base + "/api/deck")).j;
      r.check("restoring version 1 makes it live as version 4, and 2 and 3 stay in history", s.status === 200 && restored.version === 4 && restored.injects[0].title === old.injects[0].title && (await get(E(token) + "history")).j.length === 4, JSON.stringify(s));
      r.check("restoring a version that doesn't exist says so", (await post("restore", { version: 99 }, token)).status === 404);
      r.check("a save that isn't JSON is refused politely", await fetch(E(token) + "save", { method: "POST", body: "nope" }).then(x => x.status === 400));
    });
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
