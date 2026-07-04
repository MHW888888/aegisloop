'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const textFiles = [
  'README.md',
  'docs/first-run.md',
  'docs/onboarding.md',
  'docs/troubleshooting.md',
  'docs/dual-briefing.md',
  'docs/macos.md',
  'docs/maintainer-automation.md',
];

const suspiciousFragments = [
  '\uFFFD',
  'Ã',
  'Â',
  'â€™',
  'â€œ',
  'â€',
  '鈥',
  '涓',
  '鍙',
  '瀹',
  '璇',
  '绋',
  '濡',
  '娉',
  '鐢',
  '妗',
  '侰',
  '乥',
  '乺',
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

if (!process.exitCode) {
  console.log('text integrity checks passed');
}
