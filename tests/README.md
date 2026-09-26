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

Each check prints PASS or FAIL. The run ends with "All 4 test files passed" or names the files
that failed. It takes about two minutes. To run one file on its own: `node full-game.test.js`.

## What's covered

| File | What it checks |
|---|---|
| `build-number.test.js` | The build number agrees across the build log, the footer, and the summary. The page loads with no errors. The Ready for Tuesday branding is present. |
| `full-game.test.js` | Team 1, team 2 and a moderator play a whole 4-round game through the relay, including crisis injects. Every screen reaches the end, both teams agree on the winner and the damage, and polling stops at game over. |
| `relay-api.test.js` | The relay's rules: message order, each team seeing only the other's messages, the moderator seeing everything, bad input refused, CORS, the size cap, and the per-room flood limit. |
| `relay-three-screens.test.js` | One round in detail: attacks crossing, chat reaching the other team and the moderator, and the 30-minute idle pause catching up after a click. |

`helpers.js` holds the shared setup, and `run-all.js` runs every `*.test.js` file here.

## Not covered yet

- **Turn-taking mode** (two screens that take turns) and **one screen, passed**.
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
