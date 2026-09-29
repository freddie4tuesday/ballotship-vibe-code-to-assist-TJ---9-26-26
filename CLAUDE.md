# Ballotship — notes for Claude

Read `ballotship-SUMMARY.md` first (current build, standing rules, deploy and rollback), then
`ROADMAP.md`. The build log is the comment at the top of `index.html`.

## Standing rules

- **Keep the Ready for Tuesday branding.** This project is built on Ready for Tuesday's behalf
  and will be handed back to them. Never remove or replace the "Ready for Tuesday" line, the
  readyfortuesday.com board art, or the colors and fonts.
- **On-screen wording is Ready for Tuesday's content.** Propose text changes in a table for
  approval before building them.
- **Releasing: staging first, live second.** Work on the `staging` branch; `main` is only what
  is live. Run `./deploy.sh staging`, give the user the staging link and what to look at, and stop.
  **Go live (`./deploy.sh production`, from `main`) only after the user has seen the change on
  staging and clearly says to go live.** An approval given earlier, for the wording or the design,
  does not count. Never deploy to production any other way, and never push work-in-progress to
  `main`. See "Releasing" in `ballotship-SUMMARY.md`.
- **Addresses:** the page and the relay each have a live and a staging Worker. Every hostname needs
  its own specific route because `*.electionadminsuite.com/*` and `*-staging.electionadminsuite.com/*`
  belong to other apps (already in each `wrangler*.jsonc`).
- **Tests:** `npm test` from `tests/` (about 4 minutes) before every deploy, staging included; `deploy.sh`
  refuses code the tests haven't passed on. They use a local relay only.
- **Relay:** plain HTTP polling only. Don't switch to always-open WebSockets without
  hibernation (cost). Room auto-delete is deliberately off; see the roadmap.
- Work on the `staging` branch; merge it into `main` only when going live.

## Documentation rules

Full standard: DOCUMENTATION-BEST-PRACTICES.md in this project.

- Every app change gets the next build number, updated in four places that must agree: the
  build log comment at the top of the main file, the footer, the commit title ("Build N: ..."),
  and the deploy message ("build N"). Docs-only or test-only changes get no build number.
- Each build log entry records what changed, what prompted it, and how it was verified.
- Code comments explain why, not what: record what the code used to do and why it changed,
  put numbers on tradeoffs, say what happens on failure, and tag changes with the build number.
  Never reference a file or folder that isn't in the project.
- Keep ballotship-SUMMARY.md (current version, standing rules, how to deploy and roll back)
  and ROADMAP.md (Up next / Backlog / Ideas / Done) current. Add roadmap items as they come up;
  move shipped items to Done with their build number; record decisions not to do something,
  and the reasons for and against undecided items.
- Run the tests before every deploy. Never touch the live site or live data from a test.
- In the app: plain-language purpose on the first screen, define jargon at first use,
  error messages that say what to do. Keep the owner's branding unless told otherwise.
- Ask before changing standing rules listed at the top of the summary file.
