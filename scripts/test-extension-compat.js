'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

const pkg = readJson('package.json');
const manifest = readJson('chrome-extension/manifest.json');
const content = read('chrome-extension/content.js');
const background = read('chrome-extension/background.js');

assert.strictEqual(manifest.manifest_version, 3, 'extension must stay MV3');
assert.strictEqual(manifest.version, pkg.version, 'manifest version must match package.json');
assert.match(content, new RegExp(`CONTENT_VERSION = '${pkg.version.replace(/\./g, '\\.')}'`), 'content version must match package.json');

const hostPermissions = manifest.host_permissions || [];
assert.ok(hostPermissions.includes('https://chatgpt.com/*'), 'manifest must include chatgpt.com host permission');
assert.ok(hostPermissions.includes('https://chat.openai.com/*'), 'manifest must include chat.openai.com host permission');
assert.ok(hostPermissions.includes('http://127.0.0.1/*'), 'manifest must allow local bridge on 127.0.0.1 any port');
assert.ok(hostPermissions.includes('http://localhost/*'), 'manifest must allow local bridge on localhost any port');
assert.ok(!hostPermissions.some(pattern => /127\.0\.0\.1:\d+/.test(pattern)), 'manifest must not pin 127.0.0.1 to one port');

assert.match(background, /DEFAULT_BRIDGE = 'http:\/\/127\.0\.0\.1:17380'/, 'background must keep safe default bridge URL');
assert.match(background, /normalizeBridgeUrl/, 'background must normalize bridge URLs');
assert.match(background, /127\.0\.0\.1/, 'background must allow 127.0.0.1');
assert.match(background, /localhost/, 'background must allow localhost');
assert.match(background, /bridge path must start with \//, 'background must reject non-path bridge requests');
assert.match(content, /DEFAULT_BRIDGE_URL = 'http:\/\/127\.0\.0\.1:17380'/, 'content must keep default bridge URL');
assert.match(content, /bridgeUrl: DEFAULT_BRIDGE_URL/, 'content state must use the default bridge URL constant');
assert.match(content, /loadBridgeUrl/, 'content must load persisted bridge URL');
assert.match(content, /saveBridgeUrl/, 'content must save bridge URL');
assert.match(content, /normalizeBridgeUrlForPanel/, 'content must validate bridge URLs before saving them');
assert.match(content, /Bridge URL must point to 127\.0\.0\.1 or localhost/, 'content must reject non-local bridge hosts');
assert.match(content, /Bridge URL must include the local bridge port/, 'content must require an explicit local bridge port');
assert.match(content, /bridgeUrl: LE\.bridgeUrl/, 'content must forward configured bridge URL to background');
assert.match(content, /AegisLoop is NOT a built-in ChatGPT tool/, 'contract must explain AegisLoop is not a ChatGPT tool');
assert.match(content, /Do not call ChatGPT tools/, 'starter text must tell models not to call ChatGPT tools');
assert.match(content, /fenced codex JSON block/, 'contract must teach page-text codex block behavior');
assert.match(content, /tool-availability disclaimer/, 'contract must prevent Pro/reasoning model tool disclaimers');
assert.match(content, /Pro or reasoning model/, 'starter text must handle Pro/reasoning modes');
assert.match(content, /Switching GPT models keeps the same Codex route/, 'panel must explain model switching is route-neutral');
assert.match(content, /keep this route and ask it for a visible codex JSON block/, 'panel must tell users not to reconnect after Pro model tool disclaimers');
assert.match(content, /LE\.codexSessionId = me\.codexSessionId \|\| LE\.codexSessionId/, 'panel route display must refresh Codex session id from bridge state');
assert.match(content, /LE\.workspaceDir = me\.workspaceDir \|\| LE\.workspaceDir/, 'panel route display must refresh workspace from bridge state');
assert.match(content, /LE\.fullAuto = me\.fullAuto !== false/, 'panel route display must refresh automation flag from bridge state');
assert.match(content, /currentFreshReadyCodex/, 'seed submit confirmation must accept a fresh nonce codex fallback');
assert.match(content, /seed submit not confirmed by user bubble, but fresh nonce codex block seen/, 'seed fallback must log fresh nonce codex confirmation');
assert.match(content, /waitForFreshReadyCodex\(4000\)/, 'seed fallback must wait briefly for a fresh nonce codex block before pausing');

console.log('extension compatibility checks passed');
