#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

ok() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
}

fail() {
  printf '[fail] %s\n' "$1"
}

have() {
  command -v "$1" >/dev/null 2>&1
}

printf 'AegisLoop macOS setup helper\n'
printf '\n'

if [ "$(uname -s)" != "Darwin" ]; then
  warn "This helper is tuned for macOS. Continuing anyway."
fi

if have node; then
  ok "node: $(node -v)"
else
  fail "node is missing"
  printf '      Install Node.js LTS from https://nodejs.org/en/download or run: brew install node\n'
fi

if have npm; then
  ok "npm: $(npm -v)"
else
  fail "npm is missing"
  printf '      npm should be installed with Node.js LTS.\n'
fi

if have git; then
  ok "git: $(git --version)"
else
  warn "git is missing"
fi

if have gh; then
  ok "gh: $(gh --version | head -n 1)"
else
  warn "gh is optional, but useful for maintainer workflows"
  printf '       Install with: brew install gh\n'
fi

if [ -f "config.json" ]; then
  ok "config.json exists"
else
  cp config.example.json config.json
  ok "created config.json from config.example.json"
fi

if have node; then
  node scripts/init-local-config.js
else
  warn "Skipped local config initialization because node is missing."
fi

printf '\n'
printf 'Running AegisLoop doctor...\n'
if have npm; then
  npm run doctor
else
  warn "Skipped doctor because npm is missing."
fi

printf '\n'
printf 'Next steps:\n'
printf '1. Edit config.json and replace YOUR_CHATGPT_CONVERSATION_ID, YOUR_CODEX_SESSION_ID, and workspaceDir.\n'
printf '2. Find Node with: which node\n'
printf '3. If Codex is global, find npm root with: npm root -g\n'
printf '4. Start the bridge with: npm start\n'
printf '5. Open the local web UI: http://127.0.0.1:17380/ui/ or run: npm run open:ui\n'
printf '6. Optional browser loop: Chrome -> chrome://extensions -> Developer mode -> Load unpacked -> chrome-extension/\n'
printf '7. Keep the ChatGPT thread in Chat Mode, then try Arm one run first.\n'
printf '\n'
printf 'For details, see docs/macos.md\n'
