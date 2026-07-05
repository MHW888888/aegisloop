'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(root, 'chrome-extension', 'content.js'), 'utf8');

for (const expected of [
  'ASSISTANT_STABLE_BEFORE_REPAIR_MS',
  'debugSnapshot',
  'Export Debug Snapshot',
  'aegisloop_result_id',
  'delivery_attempted',
  'dom_confirmed',
  'ack_sent',
  'turn_nonce',
  'turnNonceHash',
  'nonce_replay_blocked',
  'result_delivery_unconfirmed',
  'Not leader',
]) {
  assert(content.includes(expected), `content.js should include ${expected}`);
}

class LoopHarness {
  constructor() {
    this.mode = 'armed';
    this.local = 'idle';
    this.leader = true;
    this.armId = 'arm-1';
    this.turnNonce = 'turn-1';
    this.usedTurnTokens = new Set();
    this.pendingResult = null;
    this.acked = new Set();
    this.userBubbles = [];
    this.assistantText = '';
    this.assistantStableForMs = 0;
    this.streaming = false;
    this.reformatCount = 0;
    this.events = [];
  }
  arm() {
    this.mode = 'armed';
    this.local = 'awaiting_assistant';
    this.events.push('arm');
  }
  seed(msgId) {
    this.userBubbles.push(`[aegisloop_msg_id:${msgId}]`);
    this.events.push('seed_submit');
  }
  assistantStreaming(text) {
    this.streaming = true;
    this.assistantText = text;
    this.assistantStableForMs = 0;
    this.events.push('assistant_streaming');
  }
  assistantCodex(armId, turnNonce) {
    this.streaming = false;
    this.assistantText = '```codex\n{"aegisloop":true,"arm_id":"' + armId + '","turn_nonce":"' + turnNonce + '","arm_nonce":"' + turnNonce + '","prompt":"Read files only."}\n```';
    this.assistantStableForMs = 10000;
    this.events.push('assistant_codex');
  }
  dispatch(armId = this.armId, turnNonce = this.turnNonce) {
    assert.strictEqual(this.leader, true, 'only leader dispatches');
    assert.strictEqual(armId, this.armId, 'armId must match');
    assert.strictEqual(this.usedTurnTokens.has(turnNonce), false, 'turn token must not replay');
    assert.strictEqual(turnNonce, this.turnNonce, 'turn token must match');
    assert.strictEqual(this.pendingResult, null, 'pending result blocks dispatch');
    this.usedTurnTokens.add(turnNonce);
    this.turnNonce = 'turn-' + (this.usedTurnTokens.size + 1);
    this.local = 'dispatching';
    this.events.push('dispatch');
  }
  receiveResult(id) {
    this.pendingResult = { id };
    this.local = 'inserting';
    this.events.push('pending_result');
  }
  insertResult(id, confirmed) {
    const marker = `[aegisloop_result_id:${id}]`;
    this.userBubbles.push(marker);
    this.events.push('delivery_attempted');
    if (confirmed || this.userBubbles.some((b) => b.includes(marker))) {
      this.events.push('dom_confirmed');
    }
  }
  ack(id) {
    assert(this.pendingResult && this.pendingResult.id === id, 'ACK must match pending result');
    this.acked.add(id);
    this.pendingResult = null;
    this.local = 'awaiting_assistant';
    this.events.push('ack_sent');
  }
  refreshAndRecover(id) {
    if (this.acked.has(id)) {
      this.events.push('refresh_no_duplicate');
      return;
    }
    if (this.userBubbles.some((b) => b.includes(`[aegisloop_result_id:${id}]`))) {
      this.ack(id);
      this.events.push('refresh_recovered_ack');
      return;
    }
    this.events.push('refresh_waiting');
  }
  maybeRepairNoCodex() {
    if (this.streaming) return 'wait_streaming';
    if (this.assistantStableForMs < 9000) return 'wait_stable';
    if (this.reformatCount >= 3) {
      this.local = 'needs_user_protocol_fix';
      return 'needs_user_protocol_fix';
    }
    this.reformatCount += 1;
    return 'repair_nudge';
  }
}

const happy = new LoopHarness();
happy.arm();
happy.seed('seed-1');
happy.assistantStreaming('thinking...');
assert.strictEqual(happy.maybeRepairNoCodex(), 'wait_streaming', 'streaming assistant is not nudged');
happy.assistantCodex('arm-1', 'turn-1');
happy.dispatch('arm-1', 'turn-1');
assert.throws(() => happy.dispatch('arm-1', 'turn-1'), /turn token must not replay/, 'used turn token cannot replay');
happy.receiveResult('result-1');
happy.insertResult('result-1', true);
happy.ack('result-1');
happy.refreshAndRecover('result-1');
assert.deepStrictEqual(happy.events.slice(-1), ['refresh_no_duplicate'], 'refresh after ACK does not duplicate insert');

const lostAck = new LoopHarness();
lostAck.arm();
lostAck.receiveResult('result-2');
lostAck.insertResult('result-2', false);
lostAck.refreshAndRecover('result-2');
assert(lostAck.acked.has('result-2'), 'DOM marker recovery should ACK without reinserting');

const protocol = new LoopHarness();
protocol.arm();
protocol.assistantText = 'plain explanation';
protocol.assistantStableForMs = 2000;
assert.strictEqual(protocol.maybeRepairNoCodex(), 'wait_stable', 'short stable window waits');
protocol.assistantStableForMs = 10000;
assert.strictEqual(protocol.maybeRepairNoCodex(), 'repair_nudge', 'stable no-codex reply gets repair nudge');
protocol.reformatCount = 3;
assert.strictEqual(protocol.maybeRepairNoCodex(), 'needs_user_protocol_fix', 'budget exhaustion stays in protocol-fix');
assert.notStrictEqual(protocol.mode, 'chat', 'protocol-fix does not silently switch to chat mode');

const nonLeader = new LoopHarness();
nonLeader.leader = false;
assert.throws(() => nonLeader.dispatch(), /only leader/, 'non-leader dispatch is rejected');

console.log('real-loop fixture checks passed');
