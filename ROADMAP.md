# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

- **Restore GitHub push access for this repo.** Build 1 was committed locally but the push was
  refused (403): Claude doesn't have access to `freddie4tuesday/ballotship-vibe-code-to-assist-TJ---9-26-26`.
  Reconnect GitHub at https://claude.ai/connect-github and install the Claude GitHub App on the
  repo, so every build is backed up in version history.

## Backlog

- **Relay Worker source.** The setup screen's optional relay says to use "the Cloudflare Worker
  from `worker/`", but that folder wasn't part of the uploaded file. Add its source to this repo
  and deploy it, or hide the relay option until it exists.
- **Host the board art ourselves.** The board image is hotlinked from a readyfortuesday.com
  WordPress upload. If that file moves, the board goes plain. Copy it into this repo and serve
  it alongside `index.html`.
- **Decide on branding.** The title screen still says "Ready for Tuesday". Ballot Proofing
  Workbench removed that branding in build 35; decide whether Ballotship should match.

## Ideas / maybe

_(nothing yet)_

---

## Done

- **Publish live at ballotship.electionadminsuite.com** — build 1.
- **Build number footer and change log** — build 1.
