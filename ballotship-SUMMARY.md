# Ballotship — Summary & Handoff

**Current version:** build 1
**Live at:** https://ballotship.electionadminsuite.com
**Files in this package:** this summary, `ROADMAP.md`, `index.html` (the app itself), and the
deploy config (`wrangler.jsonc`, `.assetsignore`)

---

## What it is

A single-file browser exercise for election offices, played like Battleship. Two teams each
defend a jurisdiction of seven sites on a hidden grid. Every round one team plays the adversary:
it draws an inject, writes how it runs the attack, and picks a target. The other team writes how
its office responds before it learns where the inject lands, and any site under the footprint
goes offline. Whoever knocks out more of the other jurisdiction wins, but the game is framed so
that the written responses, reviewed in the debrief, are the part that matters.

Everything runs in the browser. Progress is saved to the browser's local storage, so a reload
offers to resume the exercise in progress.

## How it can be played

| Mode | Setup |
|---|---|
| Two screens, simultaneous (recommended) | Both teams work the same inject on one clock, swap attacks, then respond on a second clock. A moderator screen runs the clock. |
| Two screens, taking turns | Each team runs its own copy. Moves pass as short codes read aloud, so no network is needed. |
| One screen, passed | Teams share one laptop, with a full-screen curtain between phases. |

Optional features on the setup screen: a relay that passes codes automatically between buildings,
an AI assignment required with every attack, a reveal of the real-world precedent after each
response, sounds, and random site placement. The round count runs from 4 to 12.

---

## How changes are tracked (and how to undo one)

Every change gets a **build number**, recorded in three places that always agree:

1. **The build log** — the HTML comment at the top of `index.html`. Each entry records what
   changed, why, and how it was checked. Read it before changing the app.
2. **The build footer** — the fixed dark bar at the bottom of every screen shows the current
   build number and a one-line summary, so anyone can tell which version they're looking at.
3. **Git and Cloudflare** — each build is one git commit, titled `Build N: ...`, and each deploy
   is sent to Cloudflare with the message `build N`. Cloudflare keeps every deployed version.

**To undo a change**, either:

- **Fastest (live site only):** in the Cloudflare dashboard, open Workers & Pages → `ballotship`
  → Deployments, find the `build N` you want, and choose Rollback. You can also run
  `npx wrangler rollback`. This changes the live site right away, but the code in git is left as
  it was.
- **Permanent:** revert that build's commit in git (`git revert <commit>`), give it the next
  build number in the log and footer, and deploy. The history then shows both the change and
  its reversal.

## Deploying

From the repo root, with a Cloudflare API token in `CLOUDFLARE_API_TOKEN`:

```
npx wrangler deploy --message "build N"
```

`wrangler.jsonc` holds the account, the custom domain, and the routes. `.assetsignore` keeps the
markdown files and config off the live site, so only `index.html` is served.

**Routing gotcha:** `electionadminsuite.com` has a wildcard route,
`*.electionadminsuite.com/*`, that sends every subdomain to `poll-worker-system`. Ballotship
needs its own specific route, `ballotship.electionadminsuite.com/*`, or the poll-worker app
answers with "Unknown jurisdiction". Ballot Proofing Workbench uses the same fix. The route is
declared in `wrangler.jsonc`, so a normal deploy keeps it in place.

---

## Technical notes (for picking up development)

- **Single HTML file**, no build step. ~4,200 lines of HTML/CSS/JS.
- **External dependencies:** Google Fonts (Barlow Condensed, IBM Plex Sans, IBM Plex Mono) and
  the board art image, which is hotlinked from readyfortuesday.com. Both need a network
  connection on load.
- **Build 1 came from a TextEdit export.** The file that was provided had been saved through
  TextEdit (Cocoa HTML Writer), which wrapped the code as escaped text. When editing locally,
  use a plain-text editor, or in TextEdit choose Format → Make Plain Text before saving, so the
  file stays real HTML.

### Development conventions worth preserving

Carried over from Ballot Proofing Workbench:

- One build number per change, logged at the top of the file and shown in the footer.
- Each log entry says what prompted the change and how it was verified, not just what changed.
- Prove a bug is real before fixing it.
- Ask rather than guess when the missing information isn't in the source material.

---

## Suggested opening prompt for a Claude chat

> Attached is a single-file browser app (Ballotship, build 1), its summary, and its roadmap.
> The build log is in the HTML comment at the top of the file — please read it before
> proposing changes. Each change should get the next build number in the log and the footer.
> I'd like to work on [X].
