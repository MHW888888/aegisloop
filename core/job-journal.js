'use strict';

const fs = require('fs');
const path = require('path');

const RECOVERABLE_STATUSES = new Set([
  'accepted',
  'process_started',
  'side_effect_started',
  'succeeded',
  'failed',
  'timed_out',
  'result_pending',
]);

function createJobJournal(dir) {
  fs.mkdirSync(dir, { recursive: true });

  function fileFor(jobId) {
    if (!/^job_[a-zA-Z0-9_-]{6,80}$/.test(String(jobId || ''))) throw new Error('invalid jobId');
    return path.join(dir, `${jobId}.json`);
  }

  function read(jobId) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(jobId), 'utf8').replace(/^\uFEFF/, ''));
    } catch {
      return null;
    }
  }

  function write(job) {
    const file = fileFor(job.jobId);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(job, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return job;
  }

  function create(input) {
    const now = new Date().toISOString();
    return write({
      schemaVersion: 1,
      status: 'accepted',
      createdAt: now,
      updatedAt: now,
      sideEffectsObserved: false,
      attempts: [],
      ...input,
    });
  }

  function transition(jobId, status, patch = {}) {
    const current = read(jobId);
    if (!current) return null;
    return write({
      ...current,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  function list() {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^job_.*\.json$/.test(entry.name))
      .map(entry => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  function reconcile(conversations) {
    const recovered = [];
    const byId = conversations || {};
    const jobs = list();
    for (const job of jobs) {
      const conversation = byId[job.conversationId];
      if (!conversation) continue;
      const pendingMatches = conversation.pendingResult
        && conversation.pendingResult.jobId === job.jobId
        && !conversation.pendingResult.consumed;
      if (job.status === 'result_pending' && pendingMatches) {
        conversation.activeDispatchHash = null;
        conversation.activeJobId = null;
        continue;
      }
      if (!RECOVERABLE_STATUSES.has(job.status)) continue;
      transition(job.jobId, 'recovery_required', {
        recoveryReason: 'bridge_restarted_before_job_terminal_delivery',
      });
      conversation.activeDispatchHash = null;
      conversation.activeJobId = null;
      conversation.loopState = 'paused';
      conversation.pauseReason = 'recovery_required';
      conversation.conversationMode = 'review';
      conversation.recoveryRequired = {
        jobId: job.jobId,
        previousStatus: job.status,
        sideEffectsObserved: job.sideEffectsObserved === true,
        reason: 'bridge_restarted_before_job_terminal_delivery',
      };
      conversation.updatedAt = Date.now();
      recovered.push(conversation.recoveryRequired);
    }
    for (const conversation of Object.values(byId)) {
      if (!conversation.activeDispatchHash) continue;
      const activeJob = jobs.find(job => job.jobId === conversation.activeJobId);
      conversation.recoveryRequired = {
        jobId: conversation.activeJobId || null,
        previousStatus: activeJob ? activeJob.status : 'legacy_active_dispatch',
        sideEffectsObserved: activeJob ? activeJob.sideEffectsObserved === true : null,
        reason: activeJob ? 'stale_active_dispatch_terminal_job' : 'stale_active_dispatch_without_journal',
      };
      conversation.activeDispatchHash = null;
      conversation.activeJobId = null;
      conversation.loopState = 'paused';
      conversation.pauseReason = 'recovery_required';
      conversation.conversationMode = 'review';
      conversation.updatedAt = Date.now();
      recovered.push(conversation.recoveryRequired);
    }
    return recovered;
  }

  return { create, list, read, reconcile, transition };
}

module.exports = { createJobJournal };
