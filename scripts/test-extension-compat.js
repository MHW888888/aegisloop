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
const server = read('server.js');

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
assert.match(background, /BRIDGE_TIMEOUT_MS = 8000/, 'background bridge fetch must have a bounded timeout');
assert.match(background, /AbortController/, 'background bridge fetch must use AbortController');
assert.match(background, /bridge_timeout/, 'background must return structured bridge timeout errors');
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
assert.match(content, /SEED_FRESH_CODEX_CONFIRM_MS = 15000/, 'seed fallback must allow slow model replies before pausing');
assert.match(content, /waitForFreshReadyCodex\(SEED_FRESH_CODEX_CONFIRM_MS\)/, 'seed fallback must use the shared fresh codex confirmation timeout');
assert.match(content, /seedSubmitUnconfirmed/, 'seed fallback must expose an unconfirmed-but-armed state');
assert.match(content, /still armed and waiting until arm TTL/, 'seed fallback must tell users it is still armed');
assert.match(content, /seed submit not confirmed; staying armed until arm TTL or manual Chat Mode/, 'seed fallback must keep waiting instead of failing to chat');
assert.doesNotMatch(content, /reason:\s*'seed_submit_not_confirmed'/, 'seed fallback must not automatically switch back to Chat Mode');
assert.match(content, /CONTENT_BRIDGE_TIMEOUT_MS = 10000/, 'content bridge calls must have a timeout safety net');
assert.match(content, /resetTransientForConversation/, 'content must reset transient state when the ChatGPT conversation changes');
assert.match(content, /NO_CODEX_GRACE_MS = 5000/, 'no-codex recovery must wait before nudging');
assert.match(content, /needs_user_protocol_fix/, 'protocol repair exhaustion must use an explicit protocol-fix state');
assert.match(content, /Selector health/, 'panel must expose selector health');
assert.match(content, /selectorHealth/, 'content must compute selector health');
assert.doesNotMatch(content, /action:\s*'chat'[\s\S]{0,120}assistant_missing_codex/, 'missing codex recovery must not silently switch to Chat Mode');

assert.match(server, /pending_result_exists/, 'server must block new dispatches while a result is pending');
assert.match(server, /ackedHashes/, 'server must separate acked hashes from attempts');
assert.match(server, /failedHashes/, 'server must track failed hashes separately');
assert.match(server, /attemptedHashes/, 'server must track attempted hashes separately');
assert.match(server, /taskkill/, 'server must kill process trees on Windows timeouts');
assert.match(server, /codex_timeout_kill_tree/, 'server must audit process-tree timeout cleanup');
assert.match(server, /createOutputBuffer/, 'server must use bounded stdout/stderr buffers');

console.log('extension compatibility checks passed');
