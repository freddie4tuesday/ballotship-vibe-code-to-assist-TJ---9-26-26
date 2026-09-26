# Ballotship — notes for Claude

Read `ballotship-SUMMARY.md` first (current build, standing rules, deploy and rollback), then
`ROADMAP.md`. The build log is the comment at the top of `index.html`.

## Standing rules

- **Keep the Ready for Tuesday branding.** This project is built on Ready for Tuesday's behalf
  and will be handed back to them. Never remove or replace the "Ready for Tuesday" line, the
  readyfortuesday.com board art, or the colors and fonts.
- **On-screen wording is Ready for Tuesday's content.** Propose text changes in a table for
  approval before building them.
- **Deploying:** from the repo root, `npx wrangler deploy --message "build N"`; for the relay,
  the same from `worker/`. Both need their own specific route because `*.electionadminsuite.com/*`
  goes to poll-worker-system (already in each `wrangler.jsonc`).
- **Tests:** `npm test` from `tests/` before every deploy. They use a local relay only.
- **Relay:** plain HTTP polling only. Don't switch to always-open WebSockets without
  hibernation (cost). Room auto-delete is deliberately off; see the roadmap.
- Work on `main`.

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
