'use strict';

const assert = require('assert');
const path = require('path');
const {
  createExecutorAdapter,
  createJsonlCollector,
  validateEnvelope,
} = require('../executors/cli-adapter');

let sideEffects = 0;
const collector = createJsonlCollector(() => { sideEffects += 1; });
collector.push('{"type":"thread.started","thread_id":"thread_test"}\n');
collector.push('{"type":"item.started","item":{"type":"command_execution","command":"npm test"}}\n');
collector.push('{"type":"item.completed","item":{"type":"agent_message","text":"{\\"status\\":\\"succeeded\\",\\"summary\\":\\"done\\",\\"files_changed\\":[],\\"commands_run\\":[\\"npm test\\"],\\"tests\\":[{\\"command\\":\\"npm test\\",\\"status\\":\\"passed\\"}],\\"risks\\":[],\\"next_candidate\\":null}"}}\n');
collector.push('{"type":"turn.completed"}\n');
const parsed = collector.finish();
assert.strictEqual(parsed.threadId, 'thread_test');
assert.strictEqual(parsed.turnStatus, 'completed');
assert.strictEqual(parsed.sideEffectsObserved, true);
assert.strictEqual(sideEffects, 1);
assert.strictEqual(parsed.schemaError, null);
assert.strictEqual(parsed.envelope.status, 'succeeded');

assert.match(validateEnvelope({}), /status/);
const malformed = createJsonlCollector();
malformed.push('{not-json}\n');
malformed.push('{"type":"turn.failed"}\n');
const malformedResult = malformed.finish();
assert.strictEqual(malformedResult.turnStatus, 'failed');
assert.strictEqual(malformedResult.parseErrors.length, 1);
assert.match(malformedResult.schemaError, /completed agent message/);

const codex = {
  bin: 'codex',
  args: ['exec', 'resume'],
  stdinFlag: '-',
  executorAdapter: 'auto',
};
const schema = path.join('schemas', 'executor-result.schema.json');
const structured = createExecutorAdapter(codex, {
  execResume: true,
  json: true,
  outputSchema: true,
}, schema);
assert.strictEqual(structured.name, 'cli-json');
assert.deepStrictEqual(structured.buildArgs('session-1', '-'), [
  'exec',
  'resume',
  '--json',
  '--output-schema',
  schema,
  'session-1',
  '-',
]);

const legacy = createExecutorAdapter(codex, {
  execResume: true,
  json: false,
  outputSchema: false,
}, schema);
assert.strictEqual(legacy.name, 'legacy');
assert.match(legacy.fallbackReason, /not all detected/);

console.log('structured executor test passed');
