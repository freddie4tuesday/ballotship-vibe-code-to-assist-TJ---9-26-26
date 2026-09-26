# Ballotship — Roadmap

Things to work on, so nothing gets lost. Add an item as soon as it comes up. When one ships,
move it to **Done** with the build number that delivered it.

Each item: a short title, then one or two lines on what and why.

---

## Up next

_(nothing yet)_

## Backlog

- **Relay Worker source.** The setup screen's optional relay says to use "the Cloudflare Worker
  from `worker/`", but that folder wasn't part of the uploaded file. Add its source to this repo
  and deploy it, or hide the relay option until it exists.
- **Host the board art ourselves.** The board image is hotlinked from a readyfortuesday.com
  WordPress upload. If that file moves, the board goes plain. Copy it into this repo and serve
  it alongside `index.html`.

## Ideas / maybe

_(nothing yet)_

---

## Done

- **Publish live at ballotship.electionadminsuite.com** — build 1.
- **Build number footer and change log** — build 1.
- **GitHub push access restored; work saved on `main`** — build 2.
- **End-to-end pipeline test** — build 2.
- **`main` made the default branch; old session branch deleted** — after build 2 (GitHub setting, no app change).
