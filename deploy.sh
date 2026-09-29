#!/usr/bin/env bash
# Ballotship release helper. STAGING first; LIVE only from main.
#
#   ./deploy.sh staging      from the `staging` branch -> https://ballotship-staging.electionadminsuite.com
#   ./deploy.sh production   from the `main` branch    -> https://ballotship.electionadminsuite.com
#
# What it refuses to do (so the process can't be skipped by accident):
#   - deploy from the wrong branch, or with uncommitted changes
#   - deploy code the tests haven't passed on (`npm test`, about 6 minutes, leaves tests/.last-pass, a
#     fingerprint of the page, the relay and the inject library's code; this checks it matches)
#   - go live with anything other than the exact page that is on staging right now
#
# Needs CLOUDFLARE_API_TOKEN (Workers edit, plus DNS edit for electionadminsuite.com). Set
# WRANGLER to change how wrangler is run (default: npx -y wrangler@latest).
set -euo pipefail
cd "$(dirname "$0")"

fail() { echo "STOP: $*" >&2; exit 1; }
target="${1:-}"
case "$target" in
  staging)
    branch=staging; pagecfg=wrangler.staging.jsonc; relaycfg=wrangler.staging.jsonc; injcfg=wrangler.staging.jsonc
    page=https://ballotship-staging.electionadminsuite.com
    relay=https://ballotship-relay-staging.electionadminsuite.com
    inj=https://ballotship-injects-staging.electionadminsuite.com ;;
  production)
    branch=main; pagecfg=wrangler.jsonc; relaycfg=wrangler.jsonc; injcfg=wrangler.jsonc
    page=https://ballotship.electionadminsuite.com
    relay=https://ballotship-relay.electionadminsuite.com
    inj=https://ballotship-injects.electionadminsuite.com ;;
  *) echo "usage: ./deploy.sh staging|production" >&2; exit 2 ;;
esac
wrangler=${WRANGLER:-npx -y wrangler@latest}

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "set CLOUDFLARE_API_TOKEN first"
[ "$(git branch --show-current)" = "$branch" ] || fail "$target deploys from the '$branch' branch; you are on '$(git branch --show-current)'"
[ -z "$(git status --porcelain)" ] || fail "there are uncommitted changes; commit them first"
diff -q <(sha256sum index.html worker/src/index.js injects/src/index.js injects/src/validate.js injects/src/meta.json injects/seed.json injects/site/editor.html injects/site/meta.js) tests/.last-pass >/dev/null 2>&1 \
  || fail "the tests haven't passed on this exact code. Run: (cd tests && npm test)"

n=$(grep -o '<span class="tag">build [0-9]*' index.html | grep -o '[0-9]*$')
[ -n "$n" ] || fail "could not read the build number from the footer of index.html"
msg="build $n"; [ "$target" = staging ] && msg="build $n (staging)"

if [ "$target" = production ]; then
  curl -fsS "https://ballotship-staging.electionadminsuite.com/?v=$RANDOM" | cmp -s - index.html \
    || fail "the page on staging is not this page. Deploy this exact build to staging, get it approved, then come back."
  echo "OK: this page is exactly what is on staging."
fi

echo "Deploying build $n to $target ($msg)..."
( cd worker && $wrangler deploy --config "$relaycfg" --message "$msg" )
# The inject library's CODE goes out with every build; the injects themselves (the deck in its store) are
# never touched by a deploy, only by the editor page.
( cd injects && $wrangler deploy --config "$injcfg" --message "$msg" )
$wrangler deploy --config "$pagecfg" --message "$msg"

echo "Checking $page ..."
ok=""
for i in 1 2 3 4 5 6 7 8; do
  if curl -fsS "$page/?v=$RANDOM" | cmp -s - index.html; then ok=1; break; fi
  sleep 10
done
[ -n "$ok" ] || fail "the page at $page does not match yet; check again in a minute"
room="deploycheck-$(date +%s)"
curl -fsS -X POST "$relay/room/$room/send" -H 'content-type: application/json' -d '{"from":"t1","code":"R1-MSG"}' | grep -q '"ok":true' || fail "relay did not accept a message at $relay"
curl -fsS "$relay/room/$room/poll?as=t2" | grep -q 'R1-MSG' || fail "relay did not return the message at $relay"
curl -fsS "$inj/api/deck" | grep -q '"injects"' || fail "the inject library did not return a deck at $inj/api/deck"
if ! ( cd injects && $wrangler secret list --config "$injcfg" 2>/dev/null | grep -q EDIT_TOKEN ); then
  echo "NOTE: the inject library has no EDIT_TOKEN secret yet, so its editor page is switched off (the game is unaffected)."
  echo "      Set one: (cd injects && npx wrangler secret put EDIT_TOKEN --config $injcfg)   then the editor is at $inj/edit/<that value>"
fi
echo "OK: $page is build $n, the relay at $relay works, and the inject library at $inj answers."

if [ "$target" = production ]; then
  git tag -f "build-$n" >/dev/null && git push origin "build-$n" 2>/dev/null || echo "(the build-$n tag was not pushed; harmless)"
fi
