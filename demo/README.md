# Ballotship demo video

A narrated walkthrough of one game: Ashwood County (team 1) and Calder County (team 2) side
by side, a 4-round simultaneous game played through a local copy of the relay, with the
approved captions and a text-to-speech voiceover. 1080p, about 6 minutes. It starts with Ashwood setting
up (the jurisdiction, then the join code) and Calder joining with the code.

The captions were approved as a table on 2026-09-26, and the rewritten script (31 captions, for build 19) on 2026-09-29. They're the `CAPTIONS` list at the top of
`record-demo.js`. The voice reads the same words, except where `SAY_OVERRIDES` rewords
something that reads badly aloud (for example "6×6" becomes "six by six").

## Re-recording it

Re-record after any change that alters what the game looks like, so the video stays current.

One-time setup:

```
cd tests && npm install && npx playwright install chromium && cd ..
pip install piper-tts imageio-ffmpeg
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx
curl -LO https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx.json
```

Then:

```
PIPER_VOICE=/path/to/en_US-lessac-high.onnx node demo/record-demo.js
```

Output lands in `demo/out/`, which is not saved to git:

- `ballotship-demo.mp4` — the video, with voiceover
- `ballotship-demo.srt` — subtitles, for YouTube or any player
- `voice-timing.json` — when each line plays

`node demo/record-demo.js --dry` skips the video and saves one screenshot per caption in
`demo/out/dry/`. Use it to check framing after a change; it takes about a minute.

## Publishing the video

It's hosted at **https://ballotship-demo.electionadminsuite.com** (the older
`ballotship-demo.electionadminsuite.workers.dev` address still works). That's a separate
Worker (`demo/wrangler.jsonc`) with its own specific route, so the live game isn't touched. The page
is `demo/site/index.html`. The video and captions are copied in at publish time and aren't
saved in git. `demo/site-worker/index.js` serves the video with byte-range support, which
iPhone and Safari need to play it.

```
cp demo/out/ballotship-demo-share.mp4 demo/site/ballotship-demo.mp4   # must stay under 25 MB
(echo WEBVTT; echo; sed -E 's/([0-9]{2}:[0-9]{2}:[0-9]{2}),([0-9]{3})/\1.\2/g' demo/out/ballotship-demo.srt) > demo/site/ballotship-demo.vtt
cd demo && npx wrangler deploy --message "demo video"
```

The shareable copy is a smaller encode of `ballotship-demo.mp4` (CRF 28). Cloudflare's limit
is 25 MB per file.

## How it works, and why

- **`director.html`** is the stage: both teams' screens side by side (each scaled to 75%),
  a caption bar, and the title cards. It isn't part of the app and is never deployed.
- **Each team's screen runs on its own local address** (ports 8601 and 8602), so the two
  saved games don't overwrite each other in the browser.
- **All typing happens inside each screen,** not through the keyboard. Both teams type at
  once, and real key presses interleave between the two screens and garble the text. That
  caused the relay address to break in early attempts.
- **Every step waits for the game to reach the next screen** instead of pausing a fixed time.
  Screens redraw their forms for a moment after they appear, so values are filled, then
  checked, then refilled if the redraw wiped them.
- **The shots are scripted,** so the game plays out the same way every time (a tie is now a draw,
  but the story of the demo needs a winner).
  - Calder hits Ashwood's polling place in round 1.
  - Ashwood hits Calder's polling places in rounds 2 and 3.
  - Calder's later shots miss.
  - In the crisis round, both teams give up squares of their four-square operations center.
- **The crisis is round 3.** Since build 14 the game starts at inject 1, so the weather crisis (inject 3)
  comes up by itself in round 3; the old demo-only swap is gone.
- **Timing marks keep the voice in sync.** The screen recorder's clock stretches over a long
  recording, by 4 to 9 seconds by the end, so the script's own clock can't place the voice.
  Each caption briefly sets a 16-pixel square in the corner to a shade that encodes its
  number (10 + 7 x the number, so up to 32 captions). After recording, the script reads the video to find when each caption actually
  appeared, places that voice line there, and paints over the square.
- **Voice lines are made before recording starts.** Making them during recording stalled the
  screen capture.
- **The board art and fonts are fetched once, up front, with curl,** because the sandbox this
  was built in can't load them in the browser directly. Anywhere else this is harmless.
- **Nothing touches the live site or the live relay.** The script stops if either screen
  isn't on the local relay.
