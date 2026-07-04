'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(relativeDir, predicate, results = []) {
  const absoluteDir = path.join(ROOT, relativeDir);
  if (!fs.existsSync(absoluteDir)) return results;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      walk(relative, predicate, results);
    } else if (predicate(relative)) {
      results.push(relative.replace(/\\/g, '/'));
    }
  }

  return results;
}

const textFiles = [
  ...fs.readdirSync(ROOT)
    .filter((name) => name.endsWith('.md'))
    .sort(),
  ...walk('docs', (relative) => relative.endsWith('.md')),
  ...walk('.github', (relative) => /\.(md|yml|yaml)$/.test(relative)),
].sort();

const suspiciousFragments = [
  '\uFFFD',
  '\u8119',
  '\u8117',
  '\u9225',
  '\u6D93',
  '\u93C5',
  '\u7B47',
  '\u5A09',
  '\u9359',
  '\u95B3',
  '\u5A11',
  '\u95B8',
  '\u940E',
  '\u9420',
  '\u7F01',
  '\u5A75',
  '\u6FDE',
  '\u95BB',
  '\u6FE1',
  '\u6E1A',
  '\u6D94',
];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

for (const relative of textFiles) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) {
    fail(`missing text file: ${relative}`);
    continue;
  }

  const text = read(relative);
  for (const fragment of suspiciousFragments) {
    if (text.includes(fragment)) {
      fail(`possible mojibake in ${relative}: ${fragment}`);
    }
  }
}

const shellScripts = [
  'scripts/start-bridge.sh',
  'scripts/setup-macos.sh',
];

for (const relative of shellScripts) {
  const text = read(relative);
  if (!text.startsWith('#!/usr/bin/env sh\n')) {
    fail(`${relative} must start with a POSIX sh shebang and LF newline`);
  }
  if (text.includes('\r')) {
    fail(`${relative} must use LF line endings for macOS/Linux`);
  }
}

const macStart = read('scripts/start-bridge.sh');
if (!macStart.includes('exec node server.js')) {
  fail('scripts/start-bridge.sh should exec node server.js');
}

const macSetup = read('scripts/setup-macos.sh');
for (const expected of ['npm run doctor', 'config.example.json', 'npm start', 'chrome://extensions']) {
  if (!macSetup.includes(expected)) {
    fail(`scripts/setup-macos.sh should mention ${expected}`);
  }
}

const browserCompatibility = read('docs/browser-compatibility.md');
for (const expected of ['Microsoft Edge', 'Tor Browser', 'https://support.torproject.org/tor-browser/features/plugins/']) {
  if (!browserCompatibility.includes(expected)) {
    fail(`docs/browser-compatibility.md should mention ${expected}`);
  }
}

const quickstart = read('docs/quickstart-card.md');
for (const expected of ['中文速记', 'Arm one run', 'Do not mix normal Q&A and automation']) {
  if (!quickstart.includes(expected)) {
    fail(`docs/quickstart-card.md should mention ${expected}`);
  }
}

const modelCompatibility = read('docs/model-compatibility.md');
for (const expected of ['not a built-in ChatGPT tool', '5.3', '5.5 Pro', 'Correction Prompt', '智能', '极速', '均衡', '高级', '超高', '专业', 'GPT-5.4', 'o3', 'conversationId', 'same local Codex session binding', 'Smooth Model Switching', 'Do not reconnect the tab']) {
  if (!modelCompatibility.includes(expected)) {
    fail(`docs/model-compatibility.md should mention ${expected}`);
  }
}

const compatibilityMatrix = read('docs/compatibility-matrix.md');
for (const expected of ['OS / local bridge', 'ChatGPT model output contract', 'GPT-5.5', 'GPT-5.4', 'GPT-5.3', 'o3', '智能', '专业', 'Route Invariant', 'Model choice is only a generation behavior', 'switch model -> keep route -> keep pending state']) {
  if (!compatibilityMatrix.includes(expected)) {
    fail(`docs/compatibility-matrix.md should mention ${expected}`);
  }
}

const modelIssueTemplate = read('.github/ISSUE_TEMPLATE/model_compatibility.yml');
for (const expected of [
  '"Pass: valid codex block on first try"',
  '"Warn: valid after correction prompt"',
  '"Fail: cannot produce valid codex block after nudges"',
  'Route invariant checks',
  'The extension panel kept the same local Codex session binding',
]) {
  if (!modelIssueTemplate.includes(expected)) {
    fail(`model compatibility issue template should quote dropdown option ${expected}`);
  }
}

const browserIssueTemplate = read('.github/ISSUE_TEMPLATE/browser_compatibility.yml');
for (const expected of ['Edge', 'Brave', 'Firefox', 'Tor Browser', 'Result ACK completed']) {
  if (!browserIssueTemplate.includes(expected)) {
    fail(`browser compatibility issue template should mention ${expected}`);
  }
}

if (!process.exitCode) {
  console.log('text integrity checks passed');
}
