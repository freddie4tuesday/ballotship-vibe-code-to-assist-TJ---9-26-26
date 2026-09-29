# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

- Nothing is waiting on review. Builds 8 to 12 are live.

## Backlog

- **Inject library page: live (build 12); open follow-ups below.** A page at its own address where the injects are
  listed and can be added, edited, reordered and deleted. Today the 16 injects are code inside
  `index.html` (`DECK`, from "the scenario workbook", which we haven't seen). **Decided:**
  - **Edits go live immediately** (no draft step). A saved edit is what the next game uses. Because a
    slip would reach real games at once, every save is a numbered version, any version can be restored
    from the page, and the page shows what changed.
  - **Anyone with the link can edit, to start with.** The link is long and unguessable (a secret in
    the address), which is not a login, and it can leak through browser history or a forwarded link.
    **Ask TJ what he prefers** for who may edit (a login by email code is the alternative). The secret link is set with `wrangler secret put EDIT_TOKEN`; changing the value cuts off every old link.
  - **Extras wanted:** history with restore; a picture of the squares an inject covers; reordering, and
    choosing which inject comes first (today number 6). Not wanted: importing from the workbook.
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
- **Auto-delete relay rooms after a set time (e.g. 24 hours) — consider, not decided.** Left
  out of the relay on purpose for now. Why it's worth considering: the exercise asks teams to
  make convincing fake material (spoofed alerts, fake headlines, voice memos), and the game's own
  rules say to "keep it in the room, and delete it after the retro." Without auto-delete, that
  material and every written attack and response stays on Cloudflare until someone removes it,
  which is a privacy and misuse risk if a room name leaks. It also keeps storage from slowly
  growing. Why it might not be wanted: a facilitator may want the relay record available for a
  later debrief or report, and each screen already keeps its own copy of the thread, so the
  relay copy may be the only shared one. A middle ground would be a longer window (e.g. 7 or
  30 days) or a "delete this room" button for the facilitator.
- **Host the board art ourselves (someday, not soon).** The board image is loaded from a
  readyfortuesday.com upload; if that file moves, the board goes plain (the game still works).
  Low priority: this project is going back to Ready for Tuesday, and linking to their copy keeps
  the image under their control. Revisit only if the link breaks or before a high-stakes session.

---

## Done

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
