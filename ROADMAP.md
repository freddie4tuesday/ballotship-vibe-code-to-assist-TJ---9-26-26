# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

_(nothing yet)_

## Backlog

- **Countdown clock for passing the laptop and taking turns.** The clock exists only in
  simultaneous mode today, as in the original. Reported after a pass-the-laptop session.
  **Decided: when time runs out, commit what's written**, as simultaneous mode does (with a
  tone if the tone option is on), and the round moves on. Open details to settle when we
  build it: the default times (attack and response, 10:00 each in simultaneous mode), where
  the clock shows when passing the laptop (the top bar, as in simultaneous), whether a
  facilitator can pause it, and how the "curtain" screen between teams interacts with it.
  App change, so the wording of any new setup options comes back here as a table first.
- **Moderator screen's final score is always 0–0 (bug, found in build 6 testing).** The
  moderator never tracks either county's damage, so when it presses "End the exercise" after
  the last round it sees a tie and starts sudden death, which switches it to the taking-turns
  screens (see the sudden-death question below). The team screens score correctly. Fix: have
  the moderator read each county's damage from the result codes already crossing the relay.
  Present before build 6 (from the code); `end-early.test.js` reports it as a known issue.
- **Question for TJ: sudden death in simultaneous mode.** When a simultaneous game ends in a
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
