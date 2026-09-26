# Documentation Best Practices

How to document a project so that anyone — you in six months, a colleague, a client you hand it
back to, or a new Claude chat — can understand it, change it safely, and undo a change.

> **How to use this file:** open a chat in any project, attach or paste this file, and say
> *"Read this and improve our documentation."* Claude follows the instructions below.

---

## Instructions for Claude

When someone gives you this file and asks you to apply it, improve the project's documentation,
or similar, work through these steps in order. The rest of this file is the standard you are
applying.

### Step 1. Survey first, change nothing yet

- Read the project: the main files, any existing `CLAUDE.md`, README, summary, changelog, roadmap,
  tests, and deploy config. Check the git log for how versions have been tracked so far.
- Check each of the six pieces in **The checklist** below: missing, partial, or already fine?
- Note anything the code or docs mention that isn't actually in the project (a folder, a test
  suite, a document).
- Note the project's existing conventions and branding. Build on them rather than replacing
  them.

### Step 2. Report and confirm the plan

Show the person a short table: each checklist item, what exists now, and what you propose to
add. List separately anything that would **change the app itself**, such as adding a footer,
changing text on screen, or changing code behavior. Then wait for them to confirm.
Documentation-only files (summary, roadmap, `CLAUDE.md`, code comments that change no behavior)
can go ahead once the plan is approved.

### Step 3. Add the documentation (no app changes)

1. **`CLAUDE.md`:** add the **Standing rules for this project** block from the end of this file.
   If a `CLAUDE.md` already exists, add the block as a new section and keep everything already
   there. Replace `<project>` with the real name.
2. **Copy this file** into the project as `DOCUMENTATION-BEST-PRACTICES.md`, so the `CLAUDE.md`
   reference resolves.
3. **Summary file:** create `<project>-SUMMARY.md` from section 1, or bring an existing one up to
   it. Fill it with facts from the code, not placeholders. Anything you don't know goes under
   "Open questions".
4. **Roadmap:** create `ROADMAP.md` from section 2. Seed it with the gaps from Step 1: missing
   pieces, things referenced but not included, missing tests, and the app changes from Step 2
   that haven't been approved yet.
5. **"Why" comments:** add them only where you can state the reason with confidence from the
   code, the git history, or the person. Never invent history. If you can't tell why something
   was done, add it to the roadmap as a question instead.
6. **Tests:** if there are none, propose a first end-to-end test and a build-number consistency
   test (section 6). Add them once approved.

### Step 4. App changes, only with approval

A build footer, a build log header, new on-screen text, glossary or definitions are all app
changes. Do them only after the person approves, as the next build number, following
section 3.

### Rules while doing this

- **Never remove or change branding** (names, logos, colors, fonts, credits) unless the person
  explicitly asks.
- **Never deploy or publish** without the person's go-ahead. Commit and push only in the way
  the project already works, or as the person asks.
- **Don't overwrite or delete existing documentation.** Merge into it and keep its history.
- **Commit docs-only work separately** from app changes, and say "docs only; no new build
  number" in the commit message.
- **Finish with a short report:** what you added, what's waiting on approval, and what went on
  the roadmap.

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

Open a chat in the project, attach this file, and say *"Read this and improve our
documentation."* Claude follows **Instructions for Claude** at the top: it surveys the project,
proposes a plan, adds the documentation, and asks before touching the app.

To do it by hand instead, follow the same steps yourself.

---

## Standing rules for this project (block for CLAUDE.md)

Claude adds this to the project's `CLAUDE.md` in Step 3. `CLAUDE.md` is read automatically at
the start of every Claude session in that project, so these rules keep applying without
anyone repeating them.

```markdown
## Documentation rules

Full standard: DOCUMENTATION-BEST-PRACTICES.md in this project.

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
