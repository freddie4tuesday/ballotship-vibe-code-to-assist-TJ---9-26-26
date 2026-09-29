# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

- **Build 14 (the game starts with the first inject) is on the branch, waiting for staging review.** Builds 8 to 13 are live.

## Backlog

- **The AI assignment becomes a feature flag: decided, not built.** "We don't need the AI in every game." Today the
  setup option "Require an AI-made artifact with every attack" is on by default, and turning it off only makes the AI
  task optional (it still shows). **Decided:** the flag is **off by default**, and when off the game **hides the AI
  completely**: no task, prompt or artifact box on the attack screen, nothing for the other team to read, no AI
  lines in the log, Word file, print or debrief questions, and the setup and Rules wording that describe it
  are dropped or reworded. When on, it works as it does now (required before an attack can be committed). It is a
  shared setting, so with the join code the host decides it for every screen. The inject library's AI task and
  prompt fields stay in the deck but become optional in the editor and in the checks. All the wording changes
  come as a table for approval first.

- **Auto-delete relay rooms after 1 week: decided, not built yet.** Why: the exercise makes convincing fake
  material (spoofed alerts, fake headlines), and the game's own rules say to delete it after the retro; without
  this it stays on Cloudflare until someone removes it, which is a privacy and misuse risk if a room name leaks, and
  storage grows slowly. Against: a facilitator may want the relay record for a later report (each screen also
  keeps its own copy, and the after-action log can be downloaded first). To settle when building: a week counts
  from the room's LAST message (so a game under way never vanishes), and the game should say on the setup screen
  that rooms are deleted after a week. Plan: a Durable Object alarm in the relay that deletes the room's messages.
- **"Watch a demo" button before the game starts: wanted, placement and kind to settle.** Proposed place: the title
  screen, under "Set up the exercise" as a quieter second button, and again in the "New to Ballotship?" box on the
  setup screen. Open: a link to the video (needs re-recording first, since it predates builds 5 to 13) or a
  self-playing walkthrough inside the game (bigger, never goes stale). New wording needs approval first.
- **One person sets up the exercise; the other screens join with a code: decided, not built.** Today each screen
  enters the same settings by hand (mode, relay address and room, rounds, team names, precedent, AI requirement,
  clock times), so a typo in the room name or rounds gives two screens that quietly don't match. **Decided:**
  - **The join code is a short code typed into a box, not a link** (a link is too much to read aloud or copy).
    With a relay, the code is the room name (something like `amber-falcon-42`, made for the host) and the shared
    settings are stored in the room, so joining fetches them.
  - **Who sets up:** the moderator, if the game has one; otherwise the first team (Team 1).
  - **The other team enters the code and chooses its own team name. Everything else is already set** by the host
    (mode, rounds, precedent, AI requirement, clock times, random placement, sound, the inject deck version).
  - **To settle when building:** the two-screen game with no relay (codes read aloud) can't fetch settings, so it
    keeps today's manual setup unless told otherwise; a custom relay address can't ride in a short code, so joining
    uses the page's own relay; if both teams pick the same side, the second is told to pick the other; a short
    code is guessable in principle (about a million combinations), which protects only exercise material.

- **Inject library page: live (build 12); open follow-ups below.** A page at its own address where the injects are
  listed and can be added, edited, reordered and deleted. Today the 16 injects are code inside
  `index.html` (`DECK`, from "the scenario workbook", which we haven't seen). **Decided:**
  - **Edits go live immediately** (no draft step). A saved edit is what the next game uses. Because a
    slip would reach real games at once, every save is a numbered version, any version can be restored
    from the page, and the page shows what changed.
  - **Anyone with the address can edit, to start with (changed in build 13: no key at all).** Build 12 had a
    long secret in the address; the owner asked for a plain address instead. Reasons for: nothing to look up or
    share, and History restores any slip. Reasons against: anyone who finds `/edit` can change the injects real
    games use, and there is no record of who. **Ask TJ what he prefers** for who may edit (a login by email code, or
    the secret link again, are the ways back).
  - **Extras wanted:** history with restore; a picture of the squares an inject covers; reordering (build 14: the first inject in the list starts the game; the separate "choose the
    starting inject" button from build 12 was dropped at the owner's request). Not wanted: importing from the workbook.
  **Design:** its own Worker and store (`injects/`), with a staging copy like everything else (code
  changes go staging first; the deck content itself is edited on the live page). The game fetches the
  deck when a game starts, keeps that deck for the whole game (a game already under way is never
  changed by an edit), and falls back to the deck built into `index.html` if it can't reach it, so
  it still works offline. The two screens of a two-screen game must use the same deck, so each
  announces its deck version and warns if they differ. The server and the game both check a deck
  before using it. Also: one inject has a sponsor credit (name, logo, link) and there is a third type,
  "External"; the editor covers both.
- **Inject library: things it doesn't do yet.** Only whole-deck saves (two people editing at once: the second is told to reload, and redo their edit); no per-inject comments or who-changed-what (the link isn't a login, so there is no "who"); a game shows which deck version it uses on the setup screen only, not in the after-action log. Add when asked. Also decide whether the built-in copy in `index.html` should ever be refreshed from the library (it is only the offline fallback, and goes stale as the library is edited).
- **Question for TJ: sudden death in simultaneous mode.** (Also why the full-game test now scripts its shots: random ones tie now and then.) When a simultaneous game ends in a
  tie, the tie-break round (`judgeEnd()` → `beginHalf()`) switches both screens to the
  *taking-turns* screens instead of another simultaneous round. Found while recording the demo.
  It may be intentional, but it looks like a bug. Ask TJ before changing it, and add a test
  either way.
- **Decide where the demo video lives long-term.** For now it's at
  https://ballotship-demo.electionadminsuite.workers.dev (its own Worker; see `demo/README.md`).
  Longer term: YouTube or Ready for Tuesday's site? Linking it from the title screen or the
  "New to Ballotship?" box would be an app change, so it needs approval.
- **Setup screen scrolls sideways on phones.** At phone width (390 px) the "Which team is at
  this screen" buttons (Team 1 / Team 2 / Moderator) are wider than the screen, so the setup
  page scrolls sideways. Present since the original file (checked against build 3), found
  during the build 4 visual check. Small layout fix: let those buttons wrap or stack.
  **Open question first: is Ballotship ever meant to be played on a phone?** It's designed
  around laptops and shared screens in a room (team screens, a moderator screen, a
  "one screen, passed" laptop mode), so a phone may never be used, and this may not be worth
  fixing. Confirm with TJ / Ready for Tuesday. If phones are out of scope, say so in the summary
  and move this to Ideas; if a facilitator might set up or follow along on a phone, fix it.
- **Get TJ's test suite and merge it with ours.** The page's code says a test suite of TJ's
  exists that "run[s] a whole game in under a second", but it wasn't in the uploaded file. Ask
  TJ for it. We now have our own suite in `tests/`. If TJ's turns up, merge the two and keep
  the best of both, following the steps in `tests/README.md`.
- **Widen test coverage.** Turn-taking and one-screen modes are now played end to end by
  `shot-marks.test.js` (build 5). Still not tested: codes typed by
  hand, resuming after closing the tab, the AI-artifact requirement, the precedent reveal,
  timed auto-commit, and sudden death. Add these over time, or take them from TJ's suite.

## Ideas / maybe

- **"Watch a demo" button in the game (Option B).** A self-playing walkthrough built into
  Ballotship, so it never goes out of date. Bigger than the video. Decide after seeing which
  parts of the video people still find confusing.
- **Host the board art ourselves (someday, not soon).** The board image is loaded from a
  readyfortuesday.com upload; if that file moves, the board goes plain (the game still works).
  Low priority: this project is going back to Ready for Tuesday, and linking to their copy keeps
  the image under their control. Revisit only if the link breaks or before a high-stakes session.

---

## Done

- **The inject editor at a plain address, no key** - build 13, live.

- **Builds 8 to 12 released together: moderator score fix, staging, clock wording, clocks in step and a clock option, the inject library and its editor page** - builds 8 to 12, live.

- **Publish live at ballotship.electionadminsuite.com** — build 1.
- **Build number footer and change log** — build 1.
- **GitHub push access restored; work saved on `main`** — build 2.
- **End-to-end pipeline test** — build 2.
- **`main` made the default branch; old session branch deleted** — after build 2 (GitHub setting, no app change).
- **Relay Worker built and live at ballotship-relay.electionadminsuite.com; idle-pause cost guardrail** — build 3.
- **Our own automated test suite (`tests/`, 4 files, 50 checks, including a full game through the relay)** — after build 3 (tests only, no app change).
- **Plain-language additions: purpose line, "New to Ballotship?" explainer, "inject" definition, glossary** — build 4.
- **Narrated demo video (4:15, voiceover, subtitles) and the tools to re-record it (`demo/`)** — after build 4 (no app change).
- **Pop-ups fit the screen; pass-the-laptop shows earlier shots and the written attack** — build 5.
- **End early and resume; ask before replacing a saved game; moderator switches the relay on; 1-round test game** — build 6.
- **The log as a Word file, and Print that prints the log instead of the whole screen** — build 7.
- **Clock wording fix** — build 10, on staging.
- **A clock for one laptop and for taking turns (option); clock changes reaching every screen, with a last look before committing at zero; a reload no longer gives clock time back** — build 11, on the branch, waiting on wording approval before staging.
