'use strict';

const { spawnSync } = require('child_process');

const SIDE_EFFECT_ITEM_TYPES = new Set([
  'command_execution',
  'commandexecution',
  'file_change',
  'filechange',
  'mcp_tool_call',
  'mcptoolcall',
  'dynamic_tool_call',
  'dynamictoolcall',
]);

function commandPrefix(codex) {
  const args = Array.isArray(codex && codex.args) ? codex.args : [];
  const execIndex = args.indexOf('exec');
  return execIndex >= 0 ? args.slice(0, execIndex) : [];
}

function runProbe(bin, args) {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
  });
  return {
    ok: !result.error && result.status === 0,
    text: `${result.stdout || ''}\n${result.stderr || ''}`.trim(),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function probeCodexCapabilities(codex) {
  const prefix = commandPrefix(codex);
  const version = runProbe(codex.bin, [...prefix, '--version']);
  const execHelp = runProbe(codex.bin, [...prefix, 'exec', '--help']);
  const resumeHelp = runProbe(codex.bin, [...prefix, 'exec', 'resume', '--help']);
  const appServerHelp = runProbe(codex.bin, [...prefix, 'app-server', '--help']);
  return {
    version: version.ok ? version.text.split(/\r?\n/)[0] : null,
    versionProbeOk: version.ok,
    execResume: resumeHelp.ok,
    json: execHelp.ok && /--json\b/.test(execHelp.text),
    outputSchema: execHelp.ok && /--output-schema\b/.test(execHelp.text),
    appServer: appServerHelp.ok,
    probeError: [version, execHelp, resumeHelp, appServerHelp]
      .map(item => item.error)
      .find(Boolean) || null,
  };
}

function validateEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'final response must be an object';
  if (!['succeeded', 'failed', 'blocked'].includes(value.status)) return 'status must be succeeded, failed, or blocked';
  if (typeof value.summary !== 'string') return 'summary must be a string';
  for (const field of ['files_changed', 'commands_run', 'tests', 'risks']) {
    if (!Array.isArray(value[field])) return `${field} must be an array`;
  }
  if (value.files_changed.some(item => typeof item !== 'string')) return 'files_changed must contain strings';
  if (value.commands_run.some(item => typeof item !== 'string')) return 'commands_run must contain strings';
  if (value.risks.some(item => typeof item !== 'string')) return 'risks must contain strings';
  if (value.tests.some(item => !item || typeof item !== 'object'
    || typeof item.command !== 'string'
    || !['passed', 'failed', 'not_run'].includes(item.status))) {
    return 'tests must contain {command,status} objects';
  }
  if (value.next_candidate !== null && typeof value.next_candidate !== 'string') {
    return 'next_candidate must be a string or null';
  }
  return null;
}

function createJsonlCollector(onSideEffect) {
  let pending = '';
  let finalText = '';
  let threadId = null;
  let turnStatus = null;
  let sideEffectsObserved = false;
  let eventCount = 0;
  const parseErrors = [];

  function consumeLine(line) {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    let event;
    try {
      event = JSON.parse(trimmed);
    } catch (error) {
      parseErrors.push(String(error.message || error));
      return;
    }
    eventCount += 1;
    if (event.type === 'thread.started') threadId = event.thread_id || threadId;
    if (event.type === 'turn.completed') turnStatus = 'completed';
    if (event.type === 'turn.failed' || event.type === 'error') turnStatus = 'failed';
    const item = event.item || {};
    const normalizedType = String(item.type || '').replace(/[-_]/g, '').toLowerCase();
    if (SIDE_EFFECT_ITEM_TYPES.has(normalizedType)) {
      if (!sideEffectsObserved && typeof onSideEffect === 'function') onSideEffect(event);
      sideEffectsObserved = true;
    }
    if (event.type === 'item.completed' && normalizedType === 'agentmessage' && typeof item.text === 'string') {
      finalText = item.text;
    }
  }

  return {
    push(chunk) {
      pending += chunk == null ? '' : chunk.toString();
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      lines.forEach(consumeLine);
    },
    finish() {
      consumeLine(pending);
      let envelope = null;
      let schemaError = null;
      if (finalText) {
        try {
          envelope = JSON.parse(finalText);
          schemaError = validateEnvelope(envelope);
        } catch (error) {
          schemaError = `final response is not JSON: ${error.message || error}`;
        }
      } else {
        schemaError = 'JSONL stream did not contain a completed agent message';
      }
      return {
        envelope,
        finalText,
        schemaError,
        threadId,
        turnStatus,
        sideEffectsObserved,
        eventCount,
        parseErrors,
      };
    },
  };
}

function createExecutorAdapter(codex, capabilities, schemaPath) {
  const configured = codex.executorAdapter || 'auto';
  const structuredReady = !!(capabilities.execResume && capabilities.json && capabilities.outputSchema);
  const name = configured === 'legacy' ? 'legacy'
    : configured === 'cli-json' ? 'cli-json'
      : structuredReady ? 'cli-json' : 'legacy';
  if (name === 'cli-json' && !structuredReady) {
    throw new Error('codex.executorAdapter=cli-json requires exec resume, --json, and --output-schema support');
  }
  return {
    name,
    fallbackReason: name === 'legacy' && configured === 'auto'
      ? 'structured CLI capabilities were not all detected'
      : null,
    buildArgs(sessionId, stdinFlag) {
      const args = [...codex.args];
      if (name === 'cli-json') args.push('--json', '--output-schema', schemaPath);
      args.push(sessionId, stdinFlag || '-');
      return args;
    },
    createCollector(onSideEffect) {
      return name === 'cli-json' ? createJsonlCollector(onSideEffect) : null;
    },
  };
}

module.exports = {
  createExecutorAdapter,
  createJsonlCollector,
  probeCodexCapabilities,
  validateEnvelope,
};
