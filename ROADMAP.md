# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

_(nothing yet)_

## Backlog

- **Relay Worker (build our own).** The setup screen's optional relay says to use "the
  Cloudflare Worker from `worker/`", but that folder wasn't part of the uploaded file. Planned
  design: a small Worker + Durable Object in `worker/`, at `ballotship-relay.electionadminsuite.com`
  (needs its own specific route, like ballotship), matching the page's existing `/send` and
  `/poll` calls, so no rewrite of the game. Cost guardrails: stop polling when a tab is hidden or
  idle for 30 minutes; a per-room request limit. Estimated cost: 3,000–5,000 requests per
  2-hour, 3-screen session (worst case ~14,400); $0 on Cloudflare's free plan (100,000/day), about
  $0.002 per session past the paid plan's included amount. Avoid an always-open WebSocket without
  hibernation, which bills every connected second and is the likely cause of an earlier costly
  relay. Confirm with TJ what that setup was before building. Room auto-delete is deliberately
  NOT included; see Ideas.

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
