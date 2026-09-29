# Ballotship — Summary & Handoff

**Current version:** build 15 (on the branch; staging is build 14, live is build 13)
**Live at:** https://ballotship.electionadminsuite.com
**Relay:** https://ballotship-relay.electionadminsuite.com (source in `worker/`)
**Inject library:** https://ballotship-injects.electionadminsuite.com (source in `injects/`; the editor is at `/edit` on that address and needs an emailed sign-in link; see The inject library)
**Files in this package:** this summary, `ROADMAP.md`, `index.html` (the app itself), the
deploy config (`wrangler.jsonc`, `.assetsignore`), `worker/` (the relay), `injects/` (the inject library), `tests/`, and `demo/`

---

> **Branding: keep Ready for Tuesday.** This project is built on Ready for Tuesday's behalf.
> Do not remove or replace its branding (the "Ready for Tuesday" title-screen line, the board art
> from readyfortuesday.com, colors, or fonts). This differs from Ballot Proofing Workbench, which
> dropped that branding in its build 35. Don't carry that change over.
> The project will eventually be handed back to Ready for Tuesday, so keep it easy for them to
> take over.

## What it is

A single-file browser exercise for election offices, played like Battleship. Two teams each
defend a jurisdiction of seven sites on a hidden grid. Every round one team plays the adversary:
it draws an inject, writes how it runs the attack, and picks a target. The other team writes how
its office responds before it learns where the inject lands, and any site under the footprint
goes offline. Whoever knocks out more of the other jurisdiction wins, but the game is framed so
that the written responses, reviewed in the debrief, are the part that matters.

Everything runs in the browser. Progress is saved to the browser's local storage, so a reload
offers to resume the exercise in progress.

## How it can be played

| Mode | Setup |
|---|---|
| Two screens, simultaneous (recommended) | Both teams work the same inject on one clock, swap attacks, then respond on a second clock. A moderator screen runs the clock. |
| Two screens, taking turns | Each team runs its own copy. Moves pass as short codes read aloud, so no network is needed. |
| One screen, passed | Teams share one laptop, with a full-screen curtain between phases. |

Optional features on the setup screen: a relay that passes codes automatically between buildings,
an AI assignment required with every attack, a reveal of the real-world precedent after each
response, sounds, and random site placement. The round count runs from 4 to 12.

---

## How changes are tracked (and how to undo one)

Every change gets a **build number**, recorded in three places that always agree:

1. **The build log** — the HTML comment at the top of `index.html`. Each entry records what
   changed, why, and how it was checked. Read it before changing the app.
2. **The build footer** — the fixed dark bar at the bottom of every screen shows the current
   build number and a one-line summary, so anyone can tell which version they're looking at.
3. **Git and Cloudflare** — each build is one git commit, titled `Build N: ...`, and each deploy
   is sent to Cloudflare with the message `build N` (`build N (staging)` on staging). Cloudflare
   keeps every deployed version. A build's number is set when it first goes on staging; fixes
   made during review are logged under that same number.

**To undo a change**, either:

- **Fastest (live site only):** in the Cloudflare dashboard, open Workers & Pages → `ballotship`
  → Deployments, find the `build N` you want, and choose Rollback. You can also run
  `npx wrangler rollback`. This changes the live site right away, but the code in git is left as
  it was.
- **Permanent:** revert that build's commit in git (`git revert <commit>`), give it the next
  build number in the log and footer, and deploy. The history then shows both the change and
  its reversal.

## The relay (`worker/`)

An optional mailbox that passes codes, chat and small attachments between screens in
different buildings, so nobody has to read codes aloud. It decides nothing; the game runs in
the browser, and if the relay is unreachable the page says so and teams read codes out instead.

- **How it works:** one Durable Object per room name, each with its own SQLite table.
  `POST /room/<room>/send` stores a message; `GET /room/<room>/poll?since=N&as=t1|t2|mod`
  returns newer messages, leaving out the asker's own (the moderator gets everything).
- **Cost:** plain requests only, so an idle room costs nothing. About 3,000–5,000 requests per
  2-hour, 3-screen session (worst case ~14,400). That's $0 on Cloudflare's free plan
  (100,000/day), or about $0.002 a session beyond the paid plan's included amount.
- **Guardrails:**
  - The page polls fast only while waiting or chatting, slows down when the tab is hidden,
    and stops after 30 idle minutes. The next click catches up, so nothing is lost.
  - The Worker refuses more than 400 requests a minute for one room, caps a room at 5,000
    messages, and caps a message at 1.5 MB.
- **Not included on purpose:** rooms are never auto-deleted. See ROADMAP.md, Ideas, for why it
  should be considered.
- **Deploy:** from `worker/`, run `npx wrangler deploy --message "build N"`.
- **Don't** switch it to always-open WebSocket connections without Cloudflare's hibernation
  feature. Those bill for every connected second and are the likely cause of an earlier costly
  relay.

## The inject library (`injects/`)

The 16 injects are kept in their own service, with a page to list, edit, add, delete and reorder them. The
list is the play order and a game starts with the first inject (build 14; it used to start at number 6). It has its own address and its own store, and a staging copy.

- **The deck:** `GET /api/deck` returns it (public, read by the game). `injects/seed.json` is the copy
  the store starts from, made from `index.html` by `node injects/tools/extract.js` (the tests check it
  still matches). After that first read the store is the truth and the array inside `index.html` is
  only the built-in copy the game falls back to.
- **Editing:** at `https://ballotship-injects.electionadminsuite.com/edit` (staging: `ballotship-injects-staging...`). It shows
  a sign-in box. **Who may edit (build 15):** anyone who can receive email at `readyfortuesday.com` or `decaro.net`
  (`ALLOWED_DOMAINS` in `injects/wrangler*.jsonc`; the domain must match exactly, so subdomains and look-alikes
  don't count). They type their address, get a one-time link (from `ballotship-no-reply@electionadminsuite.com`,
  through Resend) that works for 15 minutes, press the button it leads to, and are signed in on that browser for
  1 day. Each save records who made it (History shows it). History: build 12 had a secret link, build 13 was open to
  anyone, build 15 is this.
  - **The Resend key** is the secret `RESEND_API_KEY` on both library Workers (`wrangler secret put RESEND_API_KEY
    --config wrangler.jsonc`, and `--config wrangler.staging.jsonc`). If emails stop arriving, check the key, and that
    `electionadminsuite.com` is still verified in Resend. To let another domain in, change `ALLOWED_DOMAINS` and deploy.
  - Limits: 5 links an hour per address, 60 an hour in all. The store keeps only hashes of links and sessions.
  - Someone who leaves keeps access until their 1-day sign-in ends; there's no "remove this person" button yet (ROADMAP).
- **Edits go live at once.** Every save is a numbered version (the last 500 are kept). The editor's History
  shows what changed and restores any version (a restore is itself a new version, so nothing is lost).
  Two people saving at once: the second is told to reload.
- **What the game does with it:** reads the deck when a game starts (setup shows which version) and keeps
  it for the whole game, saved with the game, so an edit never changes a game under way. If the library
  can't be reached, or sends a deck the game's own checks refuse, the game uses the built-in deck and says so.
  Two screens compare deck versions at the start and warn if they differ.
- **Checks on a save** (`injects/src/validate.js`, repeated in the game as `sanitizeDeck`): 4 to 99 injects;
  known category, type and footprint shape (a crisis inject has none); text length limits; a sponsor's link and
  logo must be https. Text is stored as typed and always escaped when shown.
- **Deploying:** `deploy.sh` deploys the library's code with each build; it never touches the deck in the store.
  Cloudflare keeps the store in a Durable Object, so a deploy can't lose an edit.
- **Rollback of the code:** as for the page (Deployments in the dashboard). A bad *edit* is undone from the
  editor's History, not by rolling back code.

## Demo video (`demo/`)

A 4-minute narrated walkthrough of one game, made by `demo/record-demo.js`. The video isn't in
git; re-record it after any change to how the game looks. See `demo/README.md` for how,
and ROADMAP.md for where it should live.

## The clock

- **Simultaneous games** always have a clock, on every screen. Each screen counts down on its own; phase
  changes start the clocks together. When anyone pauses, resumes, adds or takes a minute, or resets,
  that screen sends one small relay message with the clock's whole state, and the other screens
  follow at their next check (up to 15 seconds; they end up exactly right, and get back time that ran
  on). Nothing is sent between presses. A clock that reaches zero checks the relay once more before it
  commits, in case a pause is on its way.
- **One laptop, or two screens taking turns:** "Use a clock" is a setup option, off by default. Attack
  and response each get their own time (10:00 by default), it waits during the hand-over and starts when
  the writing screen opens.
- **At zero,** whatever is written is committed as it stands and play moves on (no target picked means a
  random shot, and the log says so).
- A saved game keeps the time actually left, and comes back paused.
- Code: `clockSet`, `clockChanged` and "Keeping the clocks in step" in `index.html`; the relay stamps
  messages so a late one can be corrected.

## The after-action log

Three ways out of the final screen, all made by one function (`logHTML` in `index.html`), so
they always match:

- **Download the log (web page):** an `.html` file.
- **Download as Word:** a real `.docx`, made in the browser with no library, so it works
  offline. It's written directly as the zip of XML files a Word file is (`docxFromHTML`).
- **Print:** prints the same log from a hidden frame. It no longer prints the whole screen.

To change what the log says, change `logHTML` only; the Word file follows. `tests/log-export.test.js`
checks that the three agree.

## Tests (`tests/`)

Run `npm test` from `tests/` before every deploy. The first time, run `npm install` and
`npx playwright install chromium` first. It plays a whole 4-round game across three browser
screens through a local copy of the relay, checks the relay's rules, and checks that the build
number agrees across the log, footer and summary. See `tests/README.md` for what's covered and
what isn't yet, and how to merge in TJ's test suite if it turns up.

## Releasing: staging first, then live

Nothing goes live without being looked at on a staging copy first.

| | Live game | Staging copy |
|---|---|---|
| Page | https://ballotship.electionadminsuite.com | https://ballotship-staging.electionadminsuite.com |
| Relay | https://ballotship-relay.electionadminsuite.com | https://ballotship-relay-staging.electionadminsuite.com |
| Inject library | https://ballotship-injects.electionadminsuite.com | https://ballotship-injects-staging.electionadminsuite.com |
| Git branch | `main` | `staging` |
| Config | `wrangler.jsonc`, `worker/wrangler.jsonc`, `injects/wrangler.jsonc` | the same names with `.staging` |

The staging page labels itself: `[STAGING]` in the browser tab, a magenta STAGING tag in the
footer, and "STAGING" on the title screen. It uses the staging relay, and a browser keeps saved
games per address, so staging games and live games can't mix or overwrite each other.

**The path of a change:**

1. Agree the change (wording changes come as a table for approval first).
2. Build it on the `staging` branch, and run the tests: `cd tests && npm test` (about 6 minutes).
3. `./deploy.sh staging` puts it on the staging address.
4. Someone looks at it there and says whether it's good.
5. Only after that: merge `staging` into `main`, and run `./deploy.sh production`.

**`deploy.sh` enforces the order.** It deploys staging only from the `staging` branch and live
only from `main`; it refuses uncommitted changes; it refuses code the tests haven't passed on
(the tests leave a fingerprint of `index.html` and the relay, and the script checks it matches); and for live it refuses anything other than the exact page that is on
staging right now. It needs a Cloudflare API token in `CLOUDFLARE_API_TOKEN`.

The relay and the inject library need no separate step: both environments deploy the page, the relay and the library's code together. The staging game reads the staging library, so an edit made while trying things out never reaches a live game.

`wrangler.jsonc` holds the account, the custom domain, and the routes. `.assetsignore` keeps the
markdown files, config, `deploy.sh`, `worker/`, `injects/`, `tests/` and `demo/` off the site, so only
`index.html` is served.

**Routing gotcha (the same for every address here, including the inject library's):** `electionadminsuite.com` has a wildcard route,
`*.electionadminsuite.com/*`, that sends every subdomain to `poll-worker-system`. Ballotship
needs its own specific route, `ballotship.electionadminsuite.com/*`, or the poll-worker app
answers with "Unknown jurisdiction". Ballot Proofing Workbench uses the same fix. The route is
declared in `wrangler.jsonc`, so a normal deploy keeps it in place. The relay, and both staging
addresses, have their own specific routes for the same reason. (The staging addresses end in
`-staging`, a pattern that the wildcard `*-staging.electionadminsuite.com/*` sends to
`poll-worker-system-staging`; the specific routes override it.)

---

## Technical notes (for picking up development)

- **Single HTML file**, no build step. ~4,200 lines of HTML/CSS/JS.
- **External dependencies:** Google Fonts (Barlow Condensed, IBM Plex Sans, IBM Plex Mono) and
  the board art image, which is hotlinked from readyfortuesday.com. Both need a network
  connection on load.
- **Build 1 came from a TextEdit export.** The file that was provided had been saved through
  TextEdit (Cocoa HTML Writer), which wrapped the code as escaped text. When editing locally,
  use a plain-text editor, or in TextEdit choose Format → Make Plain Text before saving, so the
  file stays real HTML.

### Development conventions worth preserving

The full set, written to reuse across projects, is in `DOCUMENTATION-BEST-PRACTICES.md`.

Carried over from Ballot Proofing Workbench:

- One build number per change, logged at the top of the file and shown in the footer.
- Each log entry says what prompted the change and how it was verified, not just what changed.
- Prove a bug is real before fixing it.
- Ask rather than guess when the missing information isn't in the source material.
- Keep the Ready for Tuesday branding (see the note at the top).

---

## Suggested opening prompt for a Claude chat

> Attached is a single-file browser app (Ballotship, build 8), its summary, and its roadmap.
> The build log is in the HTML comment at the top of the file — please read it before
> proposing changes. Each change should get the next build number in the log and the footer.
> I'd like to work on [X].
