# Documentation Best Practices

How to document a project so that anyone — you in six months, a colleague, a client you hand it
back to, or a new Claude chat — can understand it, change it safely, and undo a change.

Learned on Ballotship by combining two approaches:

- **TJ's (in the code):** comments that explain *why* the code is the way it is, including what
  it used to do and why that changed.
- **Fred's (around the code):** build numbers, a build log, a summary/handoff file, a roadmap,
  and one saved version per build, so you always know what's running, what changed, and how to
  go back.

Each one covers the other's blind spot. Use both.

---

## The checklist

Every project should have these six things.

| # | Piece | Answers the question |
|---|---|---|
| 1 | **Summary file** (`<project>-SUMMARY.md`) | What is this, how does it work, how do I pick it up? |
| 2 | **Roadmap** (`ROADMAP.md`) | What's left to do, and what did we decide not to do? |
| 3 | **Build number**, shown in the app's footer | Which version am I looking at? |
| 4 | **Build log** (a comment at the top of the main file) | What changed in each version, why, and how was it checked? |
| 5 | **"Why" comments** in the code | Why is this code written this way, and what must I not undo? |
| 6 | **Automated tests**, with a README | Does it still work after my change? |

Plus two supporting habits: **write documentation into the app itself** (see 7) and
**document deploy and rollback** (see 8).

---

## 1. Summary file

One file, named after the project, that someone can read in five minutes before touching
anything.

**Include:**

- **Current version** (build number) and **live address**, on the first lines.
- **Standing rules** in a callout at the top: anything that must never be changed without
  asking. (Ballotship: *"Keep the Ready for Tuesday branding."*)
- **What it is:** plain language, for someone who has never seen it.
- **How changes are tracked, and how to undo one.**
- **How to deploy**, including anything surprising. (Ballotship: *a wildcard route sends every
  subdomain to another app unless the project has its own specific route.*)
- **Technical notes:** the non-obvious things, dependencies, and where the traps are.
- **Development conventions worth preserving.**
- **Known open items**, or a pointer to the roadmap.
- **A suggested opening prompt for a new Claude chat**, so picking the project back up takes
  one paste.

## 2. Roadmap

So nothing gets lost between sessions.

**Sections:** Up next · Backlog · Ideas / maybe · Done

**Rules:**

- Add an item **the moment it comes up**, not "later".
- Each item gets a short bold title, then one or two lines on **what and why**.
- When something ships, move it to **Done with the build number** that delivered it.
- For undecided items, write down **the reasons for and against**, so whoever decides later
  doesn't have to rediscover them. (Ballotship: auto-deleting relay rooms. For: privacy of fake
  exercise material. Against: facilitators may want the record for a debrief.)
- Record **decisions not to do something**, and why. A "no" nobody wrote down gets asked again.
- Mark low-priority items plainly: *"someday, not soon"*.

## 3. Build numbers

One number, one change, visible everywhere.

- **Every change to the app gets the next build number:** 1, 2, 3… with no gaps.
- The number appears in **four places that always agree**:
  1. the **build log** entry
  2. the **footer** on every screen (a fixed bar: `build N` plus a one-line summary)
  3. the **commit title** (`Build N: …`)
  4. the **deploy message** (`build N`), so the hosting dashboard's history lines up
- **Docs-only changes** (roadmap, summary, tests) don't get a build number, because the app
  didn't change. Say so in the commit message.
- **Add a test that fails if the four places disagree.** People forget to update one;
  a test doesn't.

## 4. Build log

A comment at the very top of the main file. It's the history that travels with the code.

**Each entry records:**

- **What changed.**
- **What prompted it:** "requested directly", or the real-world failure that exposed the
  problem.
- **How it was verified:** which tests, which real files, what was checked live.
- **Constraints discovered along the way** that aren't obvious from the code.

**Good entry:**

> `build 3` Built the relay, requested directly. The setup screen pointed to "the Cloudflare
> Worker from worker/", but that folder never came with the file… Verified with three browser
> screens against a local copy of the relay: both attacks crossed… no page errors.

**Weak entry:** `build 3 — added relay`

## 5. "Why" comments in the code

The code already shows *what* it does. Comments exist to say what the code can't.

1. **Explain why, not what.**
   *"Two seconds is comfortably inside a turn and costs nothing at this volume."*
2. **Record what it used to do and why it changed.** This is what stops the next person from
   undoing a hard-won fix.
   *"Polling used to run at a flat two seconds all exercise… It now polls fast only when
   something is actually due."*
3. **Put numbers on tradeoffs.** A number turns an opinion into a decision someone can check.
   *"Over a two-hour session that is roughly a tenth of the requests."*
4. **Say what happens when things fail,** not just the happy path.
   *"Every failure falls back to reading the code out loud."*
5. **Label each section of a long file** with a banner comment (`ONLINE TRANSPORT`,
   `THE THREAD`), so the file reads like it has a table of contents.
6. **Document test hooks and settings.**
   *"window.BALLOTSHIP_POLL_MS overrides it, which the test suite uses…"*
7. **Tag changed code with its build number** (`/* build 3 — … */`), so a reader can find the
   matching build log entry.
8. **Never reference something that isn't included.** If a comment mentions a folder, a test
   suite, or a document, ship it in the same project or say exactly where it lives. (Ballotship
   was missing both `worker/` and the test suite its comments mentioned.)

## 6. Automated tests

- Keep tests in the project (`tests/`), runnable with **one command** (`npm test`).
- **Run them before every deploy.**
- Test the **real thing end to end** where possible. (Ballotship: three browser screens play a
  whole game through a local copy of the relay.)
- Tests should **never touch the live site or live data.**
- Print plain **PASS / FAIL lines** that a non-programmer can read.
- Write a **tests README** that lists what's covered **and what isn't yet.**
- If someone else's tests turn up later, **merge them rather than replacing yours:** keep the
  clearer or faster version where they overlap, and keep everything only one of them covers.

## 7. Documentation inside the app

Most users will never open a separate document. The app has to explain itself.

- **Say the purpose in plain words on the first screen.** Clever taglines are fine, but add one
  sentence that says what the point is.
- **Define jargon the first time it appears.** Don't assume people know industry terms
  (*"inject"*) or outside references (*Battleship*). Add a **glossary** where people read
  the rules.
- **Hints under form fields** saying what goes there.
- **Error messages that tell people what to do,** not just what's wrong.
  *"Name who on your team owns this. One person."*
- **State the limits honestly** in the app. (Ballot Proofing Workbench lists what it *can't*
  check.)
- **Keep the owner's branding** unless the owner says otherwise.

## 8. Deploy and rollback

- Keep deploy settings **in the project** (for example `wrangler.jsonc`), including domains
  and routes, so a normal deploy rebuilds everything correctly.
- Keep docs, tests and config **off the live site** (for example with `.assetsignore`).
- Write down **two ways to undo a change:**
  - **Fast:** roll back in the hosting dashboard. The live site changes at once; the code
    doesn't.
  - **Permanent:** revert the commit, give it the next build number, and deploy.
- Record **costs and guardrails** for anything that runs up usage, such as a server,
  a relay or an API, with real numbers.

---

## Before every deploy

- [ ] Build number bumped in the build log, footer and summary
- [ ] Build log entry says what, why and how it was verified
- [ ] New or changed code has "why" comments tagged with the build number
- [ ] Tests pass (`npm test`)
- [ ] Roadmap updated: shipped items moved to Done with the build number
- [ ] Deployed with the message `build N`, and the live site checked
- [ ] Committed as `Build N: …` and pushed

## Adding this to an existing project

1. Copy this file into the project.
2. Create `<project>-SUMMARY.md` and `ROADMAP.md` from the outlines above.
3. Add the footer and a build log. If the project already has versions, start the log at the
   current one and note that earlier history wasn't recorded.
4. Read through the main code and add "why" comments where a decision isn't obvious,
   especially anything that was fixed after a real failure.
5. Add at least one end-to-end test and the build-number consistency test.
6. Paste the block below into the project's `CLAUDE.md`, so Claude follows these practices
   there automatically.

---

## Paste into a project's CLAUDE.md

```markdown
## Documentation rules (see DOCUMENTATION-BEST-PRACTICES.md)

- Every app change gets the next build number, updated in four places that must agree: the
  build log comment at the top of the main file, the footer, the commit title ("Build N: ..."),
  and the deploy message ("build N"). Docs-only or test-only changes get no build number.
- Each build log entry records what changed, what prompted it, and how it was verified.
- Code comments explain why, not what: record what the code used to do and why it changed,
  put numbers on tradeoffs, say what happens on failure, and tag changes with the build number.
  Never reference a file or folder that isn't in the project.
- Keep <project>-SUMMARY.md (current version, standing rules, how to deploy and roll back)
  and ROADMAP.md (Up next / Backlog / Ideas / Done) current. Add roadmap items as they come up;
  move shipped items to Done with their build number; record decisions not to do something,
  and the reasons for and against undecided items.
- Run the tests before every deploy. Never touch the live site or live data from a test.
- In the app: plain-language purpose on the first screen, define jargon at first use,
  error messages that say what to do. Keep the owner's branding unless told otherwise.
- Ask before changing standing rules listed at the top of the summary file.
```
