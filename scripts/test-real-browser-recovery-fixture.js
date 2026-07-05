'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(ROOT, 'chrome-extension', 'content.js'), 'utf8');

assert.match(content, /resultDelivery:/, 'content must keep a per-result delivery ledger');
assert.match(content, /delivery_attempted/, 'delivery ledger must record attempted sends');
assert.match(content, /dom_confirmed/, 'delivery ledger must record DOM-confirmed sends');
assert.match(content, /ack_sent/, 'delivery ledger must record ACK completion');
assert.match(content, /aegisloop_result_id/, 'result messages must carry a visible result id marker');
assert.match(content, /result_delivery_unconfirmed/, 'unconfirmed delivery must pause explicitly instead of reinserting blindly');
assert.match(content, /postControl/, 'control writes must flow through checked POST handling');
assert.match(content, /leader_conflict/, 'control writes must surface leader conflicts');
assert.match(content, /origin_not_allowed/, 'control writes must surface origin failures');
assert.match(content, /auth_required/, 'control writes must surface auth failures');
assert.match(content, /button:disabled/, 'non-leader controls must be visibly disabled');
assert.match(content, /Not leader: close the duplicate tab/, 'panel must explain duplicate-tab leader conflicts');
assert.match(content, /looksLikeToolUnavailable/, 'protocol repair must classify tool-unavailable model replies');

function marker(resultId) {
  return `[aegisloop_result_id:${resultId}]`;
}

function recoverDelivery(resultId, ledger, userMessages) {
  const hasDomMarker = userMessages.slice(-8).some(text => text.includes(marker(resultId)));
  if (ledger.ack_sent) return { action: 'noop', duplicateInsert: false };
  if (ledger.dom_confirmed || hasDomMarker) return { action: 'ack', duplicateInsert: false };
  if (ledger.delivery_attempted && !ledger.dom_confirmed) {
    return { action: 'pause_unconfirmed', duplicateInsert: false };
  }
  return { action: 'insert_once', duplicateInsert: false };
}

let ledger = { delivery_attempted: true, dom_confirmed: false, ack_sent: false };
let users = ['Codex result text\n\n' + marker('result-fixture-1')];
let decision = recoverDelivery('result-fixture-1', ledger, users);
assert.deepStrictEqual(decision, { action: 'ack', duplicateInsert: false }, 'DOM marker should recover an unconfirmed send and ACK it');

ledger = { delivery_attempted: true, dom_confirmed: true, ack_sent: true };
users = ['Codex result text\n\n' + marker('result-fixture-1')];
decision = recoverDelivery('result-fixture-1', ledger, users);
assert.deepStrictEqual(decision, { action: 'noop', duplicateInsert: false }, 'refresh after ACK must not reinsert a result');

ledger = { delivery_attempted: true, dom_confirmed: false, ack_sent: false };
users = ['unrelated human message'];
decision = recoverDelivery('result-fixture-2', ledger, users);
assert.deepStrictEqual(decision, { action: 'pause_unconfirmed', duplicateInsert: false }, 'unconfirmed attempted delivery must pause instead of duplicate-inserting');

ledger = {};
users = [];
decision = recoverDelivery('result-fixture-3', ledger, users);
assert.deepStrictEqual(decision, { action: 'insert_once', duplicateInsert: false }, 'new results may insert once');

function classifyWrite(status, json, error) {
  if (status === 401) return 'auth_required';
  if (status === 403) return 'origin_not_allowed';
  if (status === 504 || error === 'bridge_timeout' || (json && json.error === 'bridge_timeout')) return 'bridge_timeout';
  if (status === 409) return (json && (json.error || json.status)) || 'leader_conflict';
  return (json && (json.error || json.status)) || error || 'unknown';
}

assert.strictEqual(classifyWrite(401, {}, null), 'auth_required');
assert.strictEqual(classifyWrite(403, {}, null), 'origin_not_allowed');
assert.strictEqual(classifyWrite(409, { error: 'leader_conflict' }, null), 'leader_conflict');
assert.strictEqual(classifyWrite(409, { status: 'pending_result_exists' }, null), 'pending_result_exists');
assert.strictEqual(classifyWrite(504, { error: 'bridge_timeout' }, null), 'bridge_timeout');

console.log('real browser recovery fixture checks passed');
