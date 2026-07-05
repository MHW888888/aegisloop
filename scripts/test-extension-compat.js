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
const doctor = read('scripts/doctor.js');

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
assert.match(content, /loadClientId/, 'content must create a per-tab client id');
assert.match(content, /sessionStorage\.getItem\('aegisloopClientId'\)/, 'client id must be tab/session scoped');
assert.match(content, /LEADER_HEARTBEAT_MS = 5000/, 'leader lease must have a 5s heartbeat cadence');
assert.match(content, /lastLeaderHeartbeatAt/, 'content must renew the leader lease while the tab stays active');
assert.match(content, /leaderLease = r\.json\.leaderLease/, 'content must store bridge leader lease state');
assert.match(content, /clientId: LE\.clientId/, 'content must send clientId on bridge writes');
assert.match(content, /aegisloop_msg_id/, 'submit confirmation must use a unique message id');
assert.doesNotMatch(content, /containsMarker/, 'submit confirmation must not rely on weak prefix matching');
assert.match(content, /wasResultInserted/, 'content must remember inserted result ids');
assert.match(content, /markResultInserted/, 'content must mark result ids before acking');
assert.match(content, /resultId,/, 'result ACK/NACK must include resultId');
assert.match(content, /codeBlocks\.join\('\\0'\)/, 'assistant signature must include rendered code blocks');
assert.match(content, /resultDelivery:/, 'content must keep a three-step result delivery ledger');
assert.match(content, /delivery_attempted/, 'result ledger must record delivery attempts');
assert.match(content, /dom_confirmed/, 'result ledger must record DOM confirmation');
assert.match(content, /ack_sent/, 'result ledger must record ACK completion');
assert.match(content, /aegisloop_result_id/, 'result messages must include visible result ids');
assert.match(content, /result_delivery_unconfirmed/, 'unconfirmed delivery must pause instead of blindly reinserting');
assert.match(content, /postControl/, 'content must check bridge control writes');
assert.match(content, /surfaceWriteFailure/, 'content must surface failed control writes');
assert.match(content, /Tab leader/, 'panel must show leader state');
assert.match(content, /Client \/ lease/, 'panel must show client id and lease countdown');
assert.match(content, /button:disabled/, 'non-leader control buttons must be visibly disabled');
assert.match(content, /Not leader: close the duplicate tab/, 'panel must explain duplicate-tab leader conflicts');
assert.match(content, /looksLikeToolUnavailable/, 'content must classify tool-unavailable model replies');

assert.match(server, /pending_result_exists/, 'server must block new dispatches while a result is pending');
assert.match(server, /ackedHashes/, 'server must separate acked hashes from attempts');
assert.match(server, /failedHashes/, 'server must track failed hashes separately');
assert.match(server, /attemptedHashes/, 'server must track attempted hashes separately');
assert.match(server, /taskkill/, 'server must kill process trees on Windows timeouts');
assert.match(server, /codex_timeout_kill_tree/, 'server must audit process-tree timeout cleanup');
assert.match(server, /createOutputBuffer/, 'server must use bounded stdout/stderr buffers');
assert.match(server, /leaderLease/, 'server must track leader lease per conversation');
assert.match(server, /leader_conflict/, 'server must reject non-leader writes');
assert.match(server, /resultIdFor/, 'server must generate stable result ids');
assert.match(server, /already_acked/, 'result ACK must be idempotent');
assert.match(server, /MAX_BODY_BYTES/, 'server must cap API request bodies');
assert.match(server, /payload_too_large/, 'server must return structured large-body errors');
assert.match(server, /ALLOW_NO_TOKEN/, 'server must make no-token mode explicit');
assert.match(server, /AEGISLOOP_ALLOW_NO_TOKEN/, 'server must require an explicit env opt-out for no-token API use');
assert.match(server, /debugAuditRaw/, 'audit raw text must be debug-gated');
assert.match(server, /STATE_BAK_PATH/, 'server must keep a state backup');
assert.match(server, /STATE_PATH \+ '\.bad\.'/, 'server must quarantine corrupt state files');
assert.match(server, /providedNonce !== conversation\.armNonce/, 'dispatch nonce must match body armNonce exactly');
assert.doesNotMatch(server, /prompt\)\.includes\(conversation\.armNonce\)/, 'dispatch must not accept nonce only because it appears in prompt text');

assert.match(doctor, /extension localhost permissions/, 'doctor must warn about broad localhost extension permissions');
assert.match(doctor, /keep apiToken enabled/, 'doctor must recommend apiToken when localhost permissions are broad');

console.log('extension compatibility checks passed');
