'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createJobJournal } = require('../core/job-journal');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-journal-'));
try {
  const journal = createJobJournal(root);
  journal.create({
    jobId: 'job_interrupted1',
    conversationId: 'conversation-a',
    promptHash: 'hash-a',
  });
  journal.create({
    jobId: 'job_pending123',
    conversationId: 'conversation-b',
    promptHash: 'hash-b',
  });
  journal.transition('job_pending123', 'result_pending', { resultId: 'res-b' });
  journal.create({
    jobId: 'job_orphaned12',
    conversationId: 'conversation-d',
    promptHash: 'hash-d',
  });
  journal.transition('job_orphaned12', 'result_pending', { resultId: 'res-d' });

  const conversations = {
    'conversation-a': {
      activeDispatchHash: 'hash-a',
      activeJobId: 'job_interrupted1',
      pendingResult: null,
      conversationMode: 'running',
      loopState: 'running',
    },
    'conversation-b': {
      activeDispatchHash: 'hash-b',
      activeJobId: 'job_pending123',
      pendingResult: { jobId: 'job_pending123', consumed: false },
      conversationMode: 'running',
      loopState: 'running',
    },
    'conversation-c': {
      activeDispatchHash: 'legacy-hash',
      activeJobId: null,
      pendingResult: null,
      conversationMode: 'running',
      loopState: 'running',
    },
    'conversation-d': {
      activeDispatchHash: null,
      activeJobId: null,
      pendingResult: null,
      conversationMode: 'running',
      loopState: 'running',
    },
  };

  const recovered = journal.reconcile(conversations);
  assert.strictEqual(recovered.length, 3);
  assert.strictEqual(conversations['conversation-a'].activeDispatchHash, null);
  assert.strictEqual(conversations['conversation-a'].pauseReason, 'recovery_required');
  assert.strictEqual(conversations['conversation-a'].conversationMode, 'review');
  assert.strictEqual(journal.read('job_interrupted1').status, 'recovery_required');
  assert.strictEqual(conversations['conversation-b'].activeDispatchHash, null);
  assert.strictEqual(conversations['conversation-b'].recoveryRequired, undefined);
  assert.strictEqual(journal.read('job_pending123').status, 'result_pending');
  assert.strictEqual(conversations['conversation-c'].activeDispatchHash, null);
  assert.strictEqual(conversations['conversation-c'].recoveryRequired.reason, 'stale_active_dispatch_without_journal');
  assert.strictEqual(conversations['conversation-d'].pauseReason, 'recovery_required');
  assert.strictEqual(journal.read('job_orphaned12').status, 'recovery_required');

  console.log('job journal recovery test passed');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
