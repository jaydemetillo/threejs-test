#!/bin/bash
#
# Double-click this file in Finder to run the site locally.
#
# It fetches the latest commits, finds Node, installs anything missing, starts
# the dev server and opens the tuner in your browser. Leave the Terminal window
# it opens alone — the server runs inside it. Closing that window stops it.
#
# Nothing here is destructive: the update step refuses to run if you have
# uncommitted work, and only fast-forwards.
#

set -uo pipefail
cd "$(dirname "$0")" || exit 1

printf '\n  \033[1mThree.js scrollytelling\033[0m — starting local dev server\n\n'

fail() {
  printf '\n  \033[31m✗ %s\033[0m\n' "$1"
  shift
  for line in "$@"; do printf '    %s\n' "$line"; done
  printf '\n'
  read -r -p "  Press return to close this window. " _
  exit 1
}

# Finder launches this with a bare login environment, so a Node installed via
# nvm is NOT on PATH yet — that would otherwise fail with "node: command not
# found" even though it works fine in a normal Terminal.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
fi
# Homebrew installs (Apple silicon and Intel) for the non-nvm case.
for dir in /opt/homebrew/bin /usr/local/bin; do
  if [ -d "$dir" ]; then
    case ":$PATH:" in *":$dir:"*) ;; *) PATH="$dir:$PATH" ;; esac
  fi
done
export PATH

command -v node >/dev/null 2>&1 || fail \
  "Node.js not found." \
  "Install the 22 LTS build from https://nodejs.org, then double-click this again."

# Vite 8 needs ^20.19 || >=22.12. Checking here turns a confusing stack trace
# into a sentence.
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
  process.exit((a>22||(a===22&&b>=12)||(a===20&&b>=19))?0:1)' 2>/dev/null || fail \
  "Node $(node -v) is too old for this project." \
  "Vite needs ^20.19 or >=22.12 — install Node 22 LTS from https://nodejs.org."

printf '  Node %s\n' "$(node -v)"

# ---------------------------------------------------------------- update
# Pull the latest commits so double-clicking is genuinely the only step.
#
# Three guards make this safe to run unattended:
#   * skipped entirely if there is uncommitted work, so nothing you have in
#     progress is ever touched;
#   * --ff-only, so it can only advance the branch — it will never create a
#     merge commit or leave you in a conflicted state;
#   * a failure here (offline, no upstream, diverged) is reported and then
#     ignored, because being unable to reach GitHub is no reason not to run
#     the copy already on disk.
if git rev-parse --git-dir >/dev/null 2>&1; then
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    printf '  Branch %s — local changes, skipping update\n' "$branch"
  else
    before=$(git rev-parse HEAD 2>/dev/null)
    if git pull --ff-only --quiet 2>/dev/null; then
      after=$(git rev-parse HEAD 2>/dev/null)
      if [ "$before" = "$after" ]; then
        printf '  Branch %s — already up to date\n' "$branch"
      else
        printf '  Branch %s — updated (%s)\n' "$branch" \
          "$(git rev-list --count "$before".."$after" 2>/dev/null) new commit(s)"
      fi
    else
      printf '  Branch %s — could not update (offline or diverged), using local copy\n' "$branch"
    fi
  fi
fi

# Install on first run, and whenever dependencies have changed since the last
# one. Runs AFTER the update above, so a pull that adds a dependency is picked
# up in the same launch — that exact gap is what broke the first attempt at
# running this project.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  printf '  Installing dependencies (first run or deps changed)…\n\n'
  npm install || fail "npm install failed." "Scroll up for the reason."
  touch node_modules
  printf '\n'
else
  printf '  Dependencies up to date\n'
fi

printf '\n  Opening the tuner in your browser. Keep this window open.\n'
printf '  Press \033[1mControl-C\033[0m here to stop the server.\n'
printf '  Tip: add \033[1m?tier=low\033[0m to the URL to see what a budget phone gets.\n\n'

npm start
