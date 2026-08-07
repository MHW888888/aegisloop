'use strict';

const assert = require('assert');
const { configuredCodexSandboxPolicy } = require('../core/execution-policy');

function policy(args) {
  return configuredCodexSandboxPolicy({ args });
}

assert.deepStrictEqual(policy([]), {
  policy: 'not-specified',
  configured: false,
  valid: true,
  enforced: false,
  source: 'aegisloop-config',
});

for (const args of [
  ['--sandbox', 'read-only'],
  ['--sandbox=read-only'],
  ['-s', 'read-only'],
  ['-s=read-only'],
]) {
  assert.strictEqual(policy(args).policy, 'read-only');
  assert.strictEqual(policy(args).valid, true);
  assert.strictEqual(policy(args).enforced, true);
}

assert.strictEqual(policy(['--sandbox=workspace-write']).enforced, true);
assert.strictEqual(policy(['--sandbox=danger-full-access']).enforced, false);
assert.strictEqual(policy(['--sandbox=unknown-policy']).valid, false);
assert.strictEqual(policy(['--sandbox=unknown-policy']).enforced, false);
assert.strictEqual(policy(['--sandbox']).valid, false);
assert.strictEqual(policy(['--dangerously-bypass-approvals-and-sandbox']).enforced, false);

console.log('execution policy checks passed');
