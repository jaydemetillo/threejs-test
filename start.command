#!/bin/bash
#
# Double-click this file in Finder to run the site locally.
#
# It finds Node, installs anything missing, starts the dev server and opens
# the tuner in your browser. Leave the Terminal window it opens alone — the
# server runs inside it. Closing that window stops the server.
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

# Install on first run, and whenever dependencies have changed since the last
# one. This is the step that is easy to forget after pulling new commits.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  printf '  Installing dependencies (first run or deps changed)…\n\n'
  npm install || fail "npm install failed." "Scroll up for the reason."
  touch node_modules
  printf '\n'
else
  printf '  Dependencies up to date\n'
fi

printf '  Branch %s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'n/a')"
printf '\n  Opening the tuner in your browser. Keep this window open.\n'
printf '  Press \033[1mControl-C\033[0m here to stop the server.\n\n'

npm start
