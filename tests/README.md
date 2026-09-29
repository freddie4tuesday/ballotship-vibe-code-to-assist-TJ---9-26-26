# Ballotship tests

Automated checks to run before every build goes live. Everything runs on your own machine,
against a local copy of the relay. Nothing touches the live site or the live relay.

## Running them

First time only, from this folder:

```
npm install
npx playwright install chromium
```

Then, every time:

```
npm test
```

It runs every test file (about 4 minutes), prints PASS or FAIL for each check, and ends with "All N test
files passed" or names the files that failed, with how long each took. A passing run leaves
`tests/.last-pass` (ignored by git), which `deploy.sh` checks before it will deploy. To run one file on
its own: `node full-game.test.js`. To run the tests against another copy of the page (for example the
previous build, to show a bug before its fix), set `BALLOTSHIP_PAGE=/path/to/copy.html`. (`npm install`
also fetches `jszip`, which reads the .docx in the log-export test; `pip install python-docx` adds an
optional second opinion on it.)

There is no "quick" mode: one was built, then removed, because with the suite at 4 minutes it saved about
2 and added rules to maintain.

## What's covered

| File | What it checks |
|---|---|
| `build-number.test.js` | The build number agrees across the build log, the footer, and the summary. The page loads with no errors. The Ready for Tuesday branding is present. |
| `full-game.test.js` | Team 1, team 2 and a moderator play a whole 4-round game through the relay, including crisis injects. Every screen reaches the end, both teams agree on the winner and the damage, the moderator ends the exercise and agrees with them (not 0–0), and polling stops at game over. |
| `relay-api.test.js` | The relay's rules (and that a room is deleted a set time after its last message, on a relay of its own with a 3-second lifetime, and the limit of 10 wrong join codes an hour per visitor, with a 4-second hour): message order, each team seeing only the other's messages, the moderator seeing everything, bad input refused, CORS, the size cap, and the per-room flood limit. |
| `shot-marks.test.js` | Plays 4 rounds in all three ways of playing: one screen passed, two screens taking turns, and two screens simultaneous. Every "Pick your target" must mark all of that team's earlier hits and misses, and every defense must show the attack as written. `MODES=pass` runs just one way. |
| `end-early.test.js` | Ends a game early in every way of playing (and from the moderator screen), checks the final screen, a reload, and that Resume puts every screen back exactly; then plays on to the end. Also: starting over or discarding asks first, and a 1-round game plays through. |
| `log-export.test.js` | (Build 17: also that each copy carries the exercise label: banner, per-inject line, closing line, page header and footer, file names.) The after-action log three ways: web page, Word (.docx) and Print. The Word file has every required part and well-formed XML, carries the picture and link, and contains every block of the web page; Print holds exactly the web page's text with no boards. Uses python-docx as a second reader if it's installed. |
| `clock-sync.test.js` | Simultaneous game, two teams and a moderator: every clock button syncs to the other screens, a screen that hears late ends within 1.5 s of the sender, two presses at once converge, one message per press and none while idle, a clock at zero takes a last look (and doesn't commit if a pause is waiting), a change for a later phase is kept. |
| `turn-clock.test.js` | The clock option for one laptop and for two screens taking turns: setup choices, hidden during the hand-over, time-out commits for the attack, response and crisis (logged once), Pause, a reload keeps the time left, and the taking-turns response clock starting only when the attack arrives. |
| `release-process.test.js` | Staging awareness: the page at a staging address says STAGING and uses the staging relay, at the live address it doesn't, staging and live saved games stay apart. And `deploy.sh` refuses to skip the order (wrong branch, no token). |
| `injects-api.test.js` | The inject library's server, run locally with an empty store: starts from the 16 built-in injects (and checks they still match `index.html`), the editor is at a plain address, a save from another website's page is refused, a good save is numbered and kept, an out-of-date save is refused, a dozen kinds of bad deck are refused and change nothing, restore. |
| `draw-jurisdiction.test.js` | Draws (a tie ends the game at once, in the approved words; fewer cells or sites still win), the required jurisdiction (refused when empty, shown in the response hint and the log, kept after a reload, shown as text) and the demo buttons. |
| `ai-flag.test.js` | The AI assignment as a setup choice, off by default: with it off, no AI box, panel, Rules paragraphs, log lines or debrief prompt; with it on, it is required (the message says what to do), shown to the other team, logged and asked about; a reload keeps it. |
| `join-code.test.js` | One screen sets up and the others join with a code: the setup form in each state, the code and what the room holds, a joiner starting with the host's settings and inject deck, team names reaching every screen, two screens claiming one side, a wrong code and an unreachable relay, a used room being skipped, a saved host game keeping its code. |
| `injects-auth.test.js` | Signing in to the inject editor: nothing edits without it, only the two allowed domains get an email (look-alikes, subdomains and lists get none), the page answers the same either way, a link works once and a scanner opening it doesn't use it, cookie flags, sign-out, the hourly limit, and links and sign-ins that expire. Uses a stand-in for Resend that keeps the emails. |
| `injects-game.test.js` | The game and the editor page against a local library: the game uses the library's deck and keeps it after an edit and a reload, falls back to the built-in deck when the library is down or sends something the game refuses, shows typed markup as text; two screens warn only when their decks differ; the editor lists, edits, reorders, adds, deletes, shows History and restores. |
| `poll-loops.test.js` | After a burst of sends and an end-and-resume, one screen still checks the relay at the normal rate (one polling loop, not two). |
| `relay-three-screens.test.js` | One round in detail: attacks crossing, chat reaching the other team and the moderator, and the 30-minute idle pause catching up after a click. |

Every test opens the game with the inject library switched off (the built-in deck), so a test never reaches the real library; `injects-*.test.js` point it at a local one (`withInjects` in `helpers.js`, which also stands in for Resend and keeps the sign-in emails, so no test ever sends one).

With a relay, `setupScreens` (helpers) and `setup` (driver) set up on the first screen (the moderator if there is one, so create it first) and join on the others with the code, the way people do.

`helpers.js` holds the shared setup, `driver.js` plays any way of playing one step at a time, and `run-all.js` runs every `*.test.js` file here.

## Not covered yet

- **Reading codes aloud:** typing a code by hand instead of using the relay.
- **Resuming** an exercise after closing the tab.
- **The AI-artifact requirement,** the precedent reveal, sounds, and timed auto-commit when a
  clock runs out.
- **Sudden death** after a tie. It happens only by chance in the full-game test.

## Adding TJ's tests

The page mentions a test suite of TJ's that "run[s] a whole game in under a second". If it
turns up, don't replace these tests with it; merge the two and keep the best of each:

1. Put TJ's files in this folder as they are, and get them running.
2. List what each suite covers. Where both cover the same thing, keep whichever version is
   clearer or faster and drop the other.
3. Keep anything only one of them covers.
4. Carry over TJ's comments explaining why a check exists.
5. Note the merge in the build log and in `ballotship-SUMMARY.md`.
