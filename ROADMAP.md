# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

_(nothing yet)_

## Backlog

- **Get TJ's test suite and add it to this repo.** The page's code says a test suite exists that
  "run[s] a whole game in under a second" (via the `window.BALLOTSHIP_POLL_MS` setting), but it
  wasn't part of the uploaded file. Ask TJ for it. Why it matters: every build is currently
  checked by hand (a browser pass, plus a three-screen relay test for build 3); an automated
  full-game test would catch a broken rule, screen or relay handoff before it goes live, and
  gives Ready for Tuesday a safety net after handback. If TJ no longer has it, build a new one
  starting from the three-screen relay test used in build 3.

## Ideas / maybe

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
