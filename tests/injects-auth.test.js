/*
  Signing in to the inject editor (build 15): an emailed one-time link, for addresses on readyfortuesday.com
  or decaro.net. Uses a local library and a stand-in for Resend that keeps the emails, so nothing is ever sent.

    - nothing to do with editing works without a sign-in (history, an old version, save, restore), but the game
      can still read the deck, and the editor page itself loads (it shows the sign-in box)
    - only the two domains get an email; look-alikes, subdomains, lists and odd formats get none; the page's
      answer is identical either way, so it can't be used to find out who is allowed
    - the email comes from the right address, with a link on this library's own address
    - opening the link with a plain GET (a mail scanner does this) does not use it up; pressing the button does
    - a link works once; a second use is refused; a wrong or made-up token is refused
    - the sign-in cookie can't be read by scripts, is https-only and same-site
    - a signed-in save is recorded with who made it; signing out ends it at once
    - no more than 5 links an hour to one address (the 6th sends nothing)
    - a save from another website's page is refused even when signed in
    - a link expires (tested with a 2-second lifetime) and so does a sign-in (a 3-second lifetime); live uses 15 minutes and 1 day
*/
const { reporter, withInjects } = require("./helpers");

const J = { "content-type": "application/json" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const r = reporter("Inject editor sign-in (emailed link)");
  try {
    await withInjects(async (base, mail) => {
      const req = (email, headers) => fetch(base + "/api/auth/request", { method: "POST", headers: { ...J, ...(headers || {}) }, body: JSON.stringify({ email }) }).then(async x => ({ status: x.status, body: await x.text() }));
      const verify = (token) => fetch(base + "/api/auth/verify", { method: "POST", headers: J, body: JSON.stringify({ token }) });
      const status = (path, cookie, init) => fetch(base + path, { ...(init || {}), headers: { ...((init && init.headers) || {}), ...(cookie ? { cookie } : {}) } }).then(x => x.status);

      // ---- signed out ----
      r.check("the game can still read the deck with no sign-in", (await status("/api/deck")) === 200);
      r.check("the editor page loads, and offers a sign-in box", await fetch(base + "/edit").then(async x => x.status === 200 && /Email me a link/.test(await x.text())));
      r.check("history, an old version, save and restore all refuse without a sign-in",
        (await status("/api/edit/history")) === 401 && (await status("/api/edit/version/1")) === 401 &&
        (await status("/api/edit/save", "", { method: "POST", headers: J, body: "{}" })) === 401 && (await status("/api/edit/restore", "", { method: "POST", headers: J, body: "{}" })) === 401);
      r.check("'who am I' says not signed in", (await status("/api/auth/me")) === 401);

      // ---- who gets an email ----
      const refused = ["someone@gmail.com", "x@readyfortuesday.com.evil.com", "x@evilreadyfortuesday.com", "x@sub.readyfortuesday.com", "x@decaro.net.au",
        "a@decaro.net,b@evil.com", "a@decaro.net b@evil.com", "\"a b\"@decaro.net", "Name <a@decaro.net>", "a@decaro.net\nbcc: b@evil.com", "@decaro.net", "decaro.net", "", "  ", 42, null, ["a@decaro.net"]];
      const answers = [];
      for (const e of refused) answers.push((await req(e)).body);
      const allowed = await req("Fred@DeCaro.NET");
      await mail.waitFor(1);
      answers.push(allowed.body);
      await sleep(600);
      r.check("nothing is sent to " + refused.length + " look-alike, malformed or outside addresses", mail.messages.length === 1, "sent " + mail.messages.length + ": " + mail.messages.map(m => m.to).join(", "));
      r.check("the page's answer is the same for an allowed and a refused address", new Set(answers).size === 1, answers.slice(-2).join(" | "));
      const m1 = mail.messages[0];
      r.check("an allowed address is emailed, in lower case, exactly the address typed", m1 && m1.to === "fred@decaro.net", m1 && m1.to);
      r.check("...from ballotship-no-reply@electionadminsuite.com, with the Resend key", m1 && /ballotship-no-reply@electionadminsuite\.com/.test(m1.from) && m1.auth === "Bearer re_test_key", m1 && m1.from + " / " + m1.auth);
      const token = mail.tokenOf(m1);
      r.check("...containing a link to the editor page with a long token, saying it works once and expires", token.length >= 40 && /https?:\/\/[^\s]+\/edit\?t=/.test(m1.text) && /works once/.test(m1.text) && /15 minutes/.test(m1.text), m1 && m1.text.slice(0, 200));
      r.check("a readyfortuesday.com address is emailed too", await req("tj@readyfortuesday.com").then(async () => (await mail.waitFor(2)) && mail.messages[1].to === "tj@readyfortuesday.com"));

      // ---- the link ----
      await fetch(base + "/edit?t=" + token);   // what a mail scanner does
      const res = await verify(token);
      const cookie = (res.headers.get("set-cookie") || "");
      r.check("opening the page with the link (a scanner's GET) does not use it up; the button does", res.status === 200, "status " + res.status);
      r.check("the sign-in cookie is HttpOnly, Secure, SameSite=Strict, and lasts 1 day", /HttpOnly/.test(cookie) && /Secure/.test(cookie) && /SameSite=Strict/.test(cookie) && /Max-Age=86400/.test(cookie), cookie);
      const ck = cookie.split(";")[0];
      r.check("the same link a second time is refused", (await verify(token)).status === 401);
      r.check("a made-up or empty token is refused", (await verify("not-a-real-token-not-a-real-token-1234")).status === 401 && (await verify("")).status === 401 && (await verify(null)).status === 401);
      const me = await fetch(base + "/api/auth/me", { headers: { cookie: ck } });
      r.check("signed in: 'who am I' names the address", me.status === 200 && (await me.json()).email === "fred@decaro.net");
      r.check("a made-up cookie is not a sign-in", (await status("/api/edit/history", "bs_session=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG")) === 401);

      // ---- editing while signed in ----
      const d = await fetch(base + "/api/deck").then(x => x.json());
      const save = (headers) => fetch(base + "/api/edit/save", { method: "POST", headers: { ...J, cookie: ck, ...(headers || {}) }, body: JSON.stringify({ base: d.version, injects: d.injects, summary: "signed-in save" }) });
      r.check("a save from another website's page is refused even when signed in", (await save({ origin: "https://evil.example" })).status === 403);
      r.check("a signed-in save works", (await save({ origin: base })).status === 200);
      const h = await fetch(base + "/api/edit/history", { headers: { cookie: ck } }).then(x => x.json());
      r.check("the history records who saved it", h[0].by === "fred@decaro.net" && h[0].summary === "signed-in save", JSON.stringify(h[0]));

      // ---- signing out ----
      const out = await fetch(base + "/api/auth/logout", { method: "POST", headers: { ...J, cookie: ck }, body: "{}" });
      r.check("signing out ends the sign-in at once", out.status === 200 && (await status("/api/edit/history", ck)) === 401);

      // ---- rate limit: 5 links an hour to one address ----
      const before = mail.messages.length;
      for (let i = 0; i < 8; i++) await req("busy@decaro.net");
      await sleep(1500);
      r.check("no more than 5 links an hour go to one address (8 asked, " + (mail.messages.length - before) + " sent)", mail.messages.length - before === 5, "sent " + (mail.messages.length - before));
    });

    // ---- expiry, with short lifetimes ----
    await withInjects(async (base, mail) => {
      const ask = email => fetch(base + "/api/auth/request", { method: "POST", headers: J, body: JSON.stringify({ email }) });
      await ask("slow@decaro.net"); await mail.waitFor(1);
      await sleep(2600);
      const late = await fetch(base + "/api/auth/verify", { method: "POST", headers: J, body: JSON.stringify({ token: mail.tokenOf(mail.messages[0]) }) });
      r.check("a link that is opened after it expires is refused", late.status === 401, "status " + late.status);
      const ck = await mail.signIn("quick@decaro.net");
      r.check("a fresh sign-in works", (await fetch(base + "/api/edit/history", { headers: { cookie: ck } })).status === 200);
      await sleep(3200);
      r.check("...and stops working when its time is up", (await fetch(base + "/api/edit/history", { headers: { cookie: ck } })).status === 401);
    }, { vars: { TOKEN_TTL_SECONDS: "2", SESSION_TTL_SECONDS: "3" } });
  } catch (e) { r.fail("test crashed", e.stack || e.message); }
  console.log(r.failures ? r.failures + " check(s) failed." : "All checks passed.");
  process.exit(r.failures ? 1 : 0);
})();
