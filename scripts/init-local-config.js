'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const EXAMPLE_PATH = path.join(ROOT, 'config.example.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function homeRuntimeRoot() {
  if (process.platform === 'win32') return 'C:\\AegisLoopRuntime';
  return path.join(process.env.HOME || process.cwd(), 'AegisLoopRuntime');
}

function isWindowsPlaceholder(value) {
  return typeof value === 'string' && /^C:\\AegisLoopRuntime$/i.test(value);
}

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
    console.log('[ok] created config.json from config.example.json');
  }

  const config = readJson(CONFIG_PATH);
  const changed = [];

  if (!String(config.apiToken || '').trim()) {
    config.apiToken = crypto.randomBytes(24).toString('hex');
    changed.push('apiToken');
  }

  if (!config.runtimeRoot || (process.platform !== 'win32' && isWindowsPlaceholder(config.runtimeRoot))) {
    config.runtimeRoot = homeRuntimeRoot();
    changed.push('runtimeRoot');
  }

  if (Array.isArray(config.bindings)) {
    for (const binding of config.bindings) {
      if (binding && binding.conversationMode === undefined) {
        binding.conversationMode = 'chat';
        changed.push('bindings[].conversationMode');
      }
    }
  }

  if (changed.length) {
    writeJson(CONFIG_PATH, config);
    console.log(`[ok] initialized local config fields: ${[...new Set(changed)].join(', ')}`);
  } else {
    console.log('[ok] config.json already has local initialization fields');
  }

  console.log('[next] start the bridge with: npm start');
  console.log(`[next] open the local UI: http://127.0.0.1:${config.port || 17380}/ui/`);
}

main();
