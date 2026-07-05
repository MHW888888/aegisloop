'use strict';

const assert = require('assert');

function canDispatch(s) {
  return s.mode !== 'chat'
    && s.mode !== 'frozen'
    && s.local !== 'needs_user_protocol_fix'
    && s.leader === true
    && s.armIdMatches === true
    && s.turnNonceValid === true
    && s.turnNonceUsed === false
    && s.pendingResult === false;
}

function canAckOrNack(s) {
  return s.leader === true && s.pendingResult === true && s.resultIdMatches === true;
}

function shouldRepairProtocol(s) {
  if (s.hasCodex) return false;
  if (s.mode === 'chat' || s.mode === 'frozen') return false;
  if (s.streaming) return false;
  if (s.stableForMs < s.requiredStableMs) return false;
  return s.reformatCount < s.maxReformat;
}

function nextAfterProtocolBudgetSpent(s) {
  if (s.hasCodex) return s;
  if (s.reformatCount < s.maxReformat) return s;
  return { ...s, local: 'needs_user_protocol_fix', mode: s.mode };
}

const base = {
  mode: 'armed',
  local: 'awaiting_assistant',
  leader: true,
  armIdMatches: true,
  turnNonceValid: true,
  turnNonceUsed: false,
  pendingResult: false,
  resultIdMatches: true,
  hasCodex: true,
  streaming: false,
  stableForMs: 10000,
  requiredStableMs: 9000,
  reformatCount: 0,
  maxReformat: 3,
};

assert.strictEqual(canDispatch(base), true, 'armed leader with current turn token can dispatch');
assert.strictEqual(canDispatch({ ...base, mode: 'chat' }), false, 'chat mode cannot dispatch');
assert.strictEqual(canDispatch({ ...base, leader: false }), false, 'non-leader cannot dispatch');
assert.strictEqual(canDispatch({ ...base, pendingResult: true }), false, 'pending result blocks new dispatch');
assert.strictEqual(canDispatch({ ...base, armIdMatches: false }), false, 'wrong armId cannot dispatch');
assert.strictEqual(canDispatch({ ...base, turnNonceValid: false }), false, 'expired or mismatched turn token cannot dispatch');
assert.strictEqual(canDispatch({ ...base, turnNonceUsed: true }), false, 'used turn token cannot be replayed');
assert.strictEqual(canDispatch({ ...base, local: 'needs_user_protocol_fix' }), false, 'protocol-fix state cannot dispatch');

assert.strictEqual(canAckOrNack({ ...base, pendingResult: true }), true, 'leader can ACK matching pending result');
assert.strictEqual(canAckOrNack({ ...base, pendingResult: true, leader: false }), false, 'non-leader cannot ACK');
assert.strictEqual(canAckOrNack({ ...base, pendingResult: true, resultIdMatches: false }), false, 'mismatched resultId cannot ACK');
assert.strictEqual(canAckOrNack({ ...base, pendingResult: false }), false, 'no pending result cannot ACK');

assert.strictEqual(shouldRepairProtocol({ ...base, hasCodex: false }), true, 'stable no-codex reply can be repaired');
assert.strictEqual(shouldRepairProtocol({ ...base, hasCodex: false, streaming: true }), false, 'streaming reply must not be nudged');
assert.strictEqual(shouldRepairProtocol({ ...base, hasCodex: false, stableForMs: 2000 }), false, 'unstable reply must not be nudged');
assert.strictEqual(shouldRepairProtocol({ ...base, hasCodex: false, reformatCount: 3 }), false, 'spent budget must not keep nudging');

const exhausted = nextAfterProtocolBudgetSpent({ ...base, hasCodex: false, reformatCount: 3 });
assert.strictEqual(exhausted.local, 'needs_user_protocol_fix', 'budget exhaustion enters protocol-fix state');
assert.strictEqual(exhausted.mode, 'armed', 'protocol-fix state does not silently switch to chat mode');

console.log('state-machine checks passed');
