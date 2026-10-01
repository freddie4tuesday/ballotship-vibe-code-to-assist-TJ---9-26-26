# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

**Builds 21, 22 and 23 (committed, not yet deployed; live is build 20):** 21 makes the attack form's check enforce "at least a full sentence" (four words in every box); 22 puts the approved "For example: ..." answers into the built-in deck; 23 puts the approved clearer headings, hints and error messages on both forms. **Still to do:** the same examples pasted into the live inject library on its editor page (needs a signed-in editor); deploying to staging needs `CLOUDFLARE_API_TOKEN` in the environment.

**Version 1.0 (build 19) is live:** draws replace the tie-break round; a required jurisdiction at setup (log, response hints); the deck version in the log; 10 wrong join codes per visitor per hour; the "Watch a demo" button (it links to the existing video, which predates builds 5 to 17 and needs re-recording, and the demo recorder needs rewriting for join codes first).

## Backlog

- **Inject editor sign-in** (live, build 15). **Not done, add when wanted:** a way to remove a person before their day is up
  (today: change `ALLOWED_DOMAINS` and redeploy, which stops new sign-ins but not one already made; or wait a day); a list of
  individual allowed addresses inside the two domains.
- **Join codes** (live, build 16). The limit on wrong codes is in build 18. **Follow-ups:** "remove a screen that joined by mistake" (today, start a new exercise); the limit only covers the join screen's lookups (a script polling rooms directly isn't counted, so the code's length is the real protection: consider a longer code if this is ever a worry).
- **Inject library** (live, build 12). Open follow-ups: only whole-deck saves (two people editing at once: the second is told to
  reload and redo their edit); no per-inject comments; whether the built-in copy of the injects in `index.html` (the offline
  fallback) should ever be refreshed from the library, since it goes stale as the library is edited. Design notes: its own Worker
  and store (`injects/`) with a staging copy; the game fetches the deck when a game starts and keeps it for the whole game; edits
  go live at once with every save a restorable version; a joining screen plays the host's deck (build 16); the server and the game
  both check a deck; one inject has a sponsor credit and there is a third type, "External".
- **The demo video:** re-recorded for version 1.0; the game's "Watch a demo" button points at the new address from build 20. **Where it lives long-term:** it is at https://ballotship-demo.electionadminsuite.com (its own Worker); decide later whether it should also be on YouTube or Ready for Tuesday's site. For now it's at https://ballotship-demo.electionadminsuite.workers.dev (its own
  Worker; see `demo/README.md`). Longer term: YouTube or Ready for Tuesday's site? Item 5 above links to it.
- **Widen test coverage.** Not tested: codes typed by hand in the set-up-by-hand games, resuming after closing the tab, the
  precedent reveal, and timed auto-commit. (Sudden death goes away in build 18.)
- **Hand back to Ready for Tuesday.** Plan the transfer of the Cloudflare and GitHub accounts and secrets. Rotate the Cloudflare
  token and the Resend key that were pasted into a chat. GitHub refuses `build-N` tag pushes from the working environment, so
  tags have to be created on GitHub (harmless).

## Ideas / maybe

- **A self-playing "Watch a demo" inside the game.** Never goes stale, but much bigger than the video link. Decide after seeing
  which parts of the video people still find confusing.
- **Host the board art ourselves (someday, not soon).** The board image is loaded from a readyfortuesday.com upload; if that file
  moves, the board goes plain (the game still works). Low priority: this project is going back to Ready for Tuesday, and linking
  to their copy keeps the image under their control. Revisit only if the link breaks or before a high-stakes session.

## Decided not to do

- **Phones.** Ballotship is not designed for phones (owner, from the questions for TJ), so the setup screen's sideways scrolling at
  phone width stays as it is.
- **TJ's test suite.** The page's code mentions one, but we have our own in `tests/` and won't chase his.
- **TJ's costly relay.** Not pursued. The relay stays plain HTTP polling (never always-open WebSockets without hibernation, which
  is the likely cause of the expense).
- **Importing the injects from the scenario workbook.** Not wanted; the library is edited by hand.
- **Choosing a starting inject** separately from the order (build 12 had a button; build 14 removed it: the first inject starts).

---

## Done

- **Version 1.1 (build 20): the demo video re-recorded and moved to its own address, the game's demo buttons pointing at it, the rounds hint no longer saying "workbook order"** - live.

- **The live game's footer shows a version number (1.0) instead of the build number** - build 19, live.

- **Draws replace the tie-break round; a required jurisdiction at setup (log, response hints); the deck version in the log; 10 wrong join codes per visitor per hour; a "Watch a demo" button** - build 18, live.

- **Relay rooms deleted a week after their last message; the AI assignment as an option (off by default, hidden when off); the join box forgiving about the code's shape; the relay always on for two-screen games with a "set up by hand" fallback; updated mode cards; the exercise label in the after-action log** - build 17, live.

- **The inject editor at a plain address, no key** - build 13 (replaced by the emailed sign-in in build 15).
- **The game starts with the first inject; the order is set in the inject library** - build 14, live.
- **The inject editor's emailed sign-in link (readyfortuesday.com, decaro.net; 1 day; Resend)** - build 15, live.
- **One screen sets up, the others join with a code** - build 16, live.

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
- **Clock wording fix** — build 10, live (released with builds 8 to 12).
- **A clock for one laptop and for taking turns (option); clock changes reaching every screen, with a last look before committing at zero; a reload no longer gives clock time back** — build 11, live.
