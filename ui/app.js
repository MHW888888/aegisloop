'use strict';

const clientKey = 'aegisloop-ui-client-id';
const state = {
  conversations: [],
  selectedId: '',
  authenticated: false,
  running: false,
  recovering: false,
  cancelRequested: false,
  currentTemplate: 'audit',
  lastResult: '',
  recoveredPending: null,
  maxLoopDispatches: 12,
  progressTimer: null,
};

const $ = (id) => document.getElementById(id);

const templates = {
  audit: {
    title: 'Inspect workspace',
    prompt: [
      'Inspect the current workspace without requesting file edits.',
      'This is a prompt-level instruction, not an OS or Codex sandbox.',
      'Do not modify, create, delete, rename, stage, commit, or push files.',
      '',
      'Summarize:',
      '1. what this workspace appears to be for;',
      '2. the main directories and important files;',
      '3. the current state, risks, and likely blockers;',
      '4. the safest next 5 local Codex tasks, ordered by impact and reversibility;',
      '5. any information that requires human confirmation.',
      '',
      'Use source-status labels like [known|HIGH] or [inference|MEDIUM].',
      'Do not invent facts.',
    ].join('\n'),
  },
  plan: {
    title: 'Plan next steps',
    prompt: [
      'Create a practical next-step plan for the current workspace.',
      'Do not modify files.',
      '',
      'Use only local files and clearly mark assumptions.',
      'Return a staged plan with:',
      '1. immediate blockers;',
      '2. quick wins;',
      '3. work that requires human confirmation;',
      '4. exact files likely touched in each stage;',
      '5. a recommended next single Codex task.',
    ].join('\n'),
  },
  patch: {
    title: 'One safe change',
    prompt: [
      'Make one small, reversible improvement in the current workspace.',
      '',
      'Constraints:',
      '- choose exactly one issue;',
      '- keep the change narrow and easy to review;',
      '- do not invent facts, credentials, external data, or hidden requirements;',
      '- do not commit, stage, push, delete, or rename files;',
      '- after editing, run the narrowest relevant read-only check and report changed files.',
      '',
      'If no safe change is possible without human confirmation, stop and explain why.',
    ].join('\n'),
  },
  custom: {
    title: 'Custom',
    prompt: 'Describe one precise local Codex task. Keep it small, reversible, and verifiable.',
  },
};

function clientIdFor() {
  let id = localStorage.getItem(clientKey);
  if (!id) {
    id = `ui-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
    localStorage.setItem(clientKey, id);
  }
  return id;
}

function setPill(el, kind, text) {
  el.className = `pill ${kind}`;
  el.textContent = text;
}

function log(message) {
  const li = document.createElement('li');
  const time = document.createElement('time');
  const text = document.createElement('span');
  time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  text.textContent = message;
  li.append(time, text);
  $('activityLog').prepend(li);
}

function setRunResult(text) {
  state.lastResult = text;
  const output = $('resultOutput');
  output.textContent = text;
  output.scrollTop = output.scrollHeight;
}

function appendRunResult(text) {
  setRunResult(state.lastResult ? `${state.lastResult}\n${text}` : text);
}

function clearProgress() {
  if (state.progressTimer) clearInterval(state.progressTimer);
  state.progressTimer = null;
  $('progressBar').style.width = '0%';
}

function startProgress() {
  clearProgress();
  let value = 8;
  $('progressBar').style.width = `${value}%`;
  state.progressTimer = setInterval(() => {
    value = Math.min(88, value + Math.max(1, (90 - value) * 0.07));
    $('progressBar').style.width = `${value}%`;
  }, 900);
}

function finishProgress(ok) {
  if (state.progressTimer) clearInterval(state.progressTimer);
  state.progressTimer = null;
  $('progressBar').style.width = ok ? '100%' : '0%';
}

async function api(path, options = {}) {
  const headers = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'same-origin',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    const detail = json.error || json.message || text || response.statusText;
    const error = new Error(detail);
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

function realConversations(conversations) {
  return conversations.filter((c) => {
    return c.conversationId
      && c.codexSessionId
      && c.workspaceDir
      && !String(c.conversationId).startsWith('CONNECT_THIS_CHAT')
      && !String(c.codexSessionId).startsWith('SET_CODEX_SESSION');
  });
}

function selectedConversation() {
  return state.conversations.find((c) => c.conversationId === state.selectedId) || state.conversations[0] || null;
}

function renderConversationOptions() {
  const select = $('conversationSelect');
  const current = select.value || state.selectedId;
  select.innerHTML = '';
  for (const conversation of state.conversations) {
    const option = document.createElement('option');
    option.value = conversation.conversationId;
    option.textContent = shortWorkspace(conversation.workspaceDir);
    select.append(option);
  }
  if (state.conversations.some((c) => c.conversationId === current)) {
    select.value = current;
  } else if (state.conversations[0]) {
    select.value = state.conversations[0].conversationId;
  }
  state.selectedId = select.value;
}

function shortWorkspace(workspace) {
  const parts = String(workspace || '').split('/').filter(Boolean);
  return parts.slice(-1)[0] || workspace || 'Unknown workspace';
}

function leaderAvailable(conversation) {
  const lease = conversation && conversation.leaderLease;
  return !lease
    || Number(lease.expiresAt || 0) <= Date.now()
    || lease.clientId === clientIdFor();
}

function renderStatus() {
  const c = selectedConversation();
  if (!c) {
    $('modeText').textContent = '-';
    $('turnText').textContent = '-';
    $('pendingText').textContent = '-';
    $('jobText').textContent = '-';
    $('capsuleText').textContent = '-';
    $('sandboxText').textContent = '-';
    $('workspacePath').textContent = 'No registered AegisLoop conversation.';
    setPill($('runStatus'), 'warn', 'No workspace');
    $('runBtn').disabled = true;
    $('runLoopBtn').disabled = true;
    renderRecoveryControls(null);
    return;
  }

  $('modeText').textContent = `${c.conversationMode || 'chat'} / ${c.loopState || 'paused'}`;
  $('turnText').textContent = String(c.turn || 0);
  $('pendingText').textContent = c.hasPendingResult ? 'yes' : 'no';
  $('jobText').textContent = c.lastJobId || '-';
  $('workspacePath').textContent = c.workspaceDir || 'No workspace path';
  const executionPolicy = c.executionPolicy || {};
  const capsule = executionPolicy.capsule || {};
  const sandbox = executionPolicy.codexSandbox || {};
  $('capsuleText').textContent = capsule.enabled
    ? `${capsule.mode || 'configured'} guidance`
    : 'disabled';
  $('capsuleText').title = capsule.enabled
    ? `Prompt/cwd policy; execution cwd: ${capsule.executionCwd || '-'}`
    : 'No capsule policy is configured.';
  $('sandboxText').textContent = sandbox.valid === false
    ? `${sandbox.policy || 'invalid'}; invalid, not enforced`
    : sandbox.enforced
      ? `${sandbox.policy} enforced`
      : `${sandbox.policy || 'not-specified'}; not enforced`;
  $('sandboxText').title = `Source: ${sandbox.source || 'unknown'}; configured: ${sandbox.configured === true ? 'yes' : 'no'}`;

  const canLead = leaderAvailable(c);
  if (!canLead) {
    setPill($('runStatus'), 'warn', 'In use elsewhere');
  } else if (c.recoveryRequired) {
    setPill($('runStatus'), 'bad', 'Recovery required');
  } else if (c.hasPendingResult) {
    setPill($('runStatus'), 'warn', 'Result pending');
  } else if (state.running || c.conversationMode === 'running') {
    setPill($('runStatus'), 'warn', 'Codex running');
  } else if (c.conversationMode === 'chat') {
    setPill($('runStatus'), 'ok', 'Ready');
  } else {
    setPill($('runStatus'), 'neutral', c.conversationMode || 'Idle');
  }

  const runBlocked = !state.authenticated
    || state.running
    || !canLead
    || !!c.recoveryRequired
    || !!c.activeDispatchHash
    || !!c.hasPendingResult;
  $('runBtn').disabled = runBlocked;
  $('runLoopBtn').disabled = runBlocked;
  renderRecoveryControls(c);
}

function renderRecoveryControls(conversation) {
  const recovered = state.recoveredPending;
  const matchingRecovered = !!(conversation
    && recovered
    && recovered.conversationId === conversation.conversationId
    && (!conversation.pendingResultId || recovered.result.resultId === conversation.pendingResultId));
  if (recovered && !matchingRecovered) state.recoveredPending = null;
  $('recoverBtn').hidden = matchingRecovered;
  $('recoverBtn').disabled = !conversation
    || !state.authenticated
    || state.recovering
    || !conversation.hasPendingResult
    || !leaderAvailable(conversation);
  $('ackRecoveredBtn').hidden = !matchingRecovered;
  $('nackRecoveredBtn').hidden = !matchingRecovered;
  $('ackRecoveredBtn').disabled = state.recovering;
  $('nackRecoveredBtn').disabled = state.recovering;
}

async function refreshStatus(quiet = false) {
  try {
    const health = await fetch('/health').then((r) => r.json());
    setPill($('bridgeStatus'), health.ok ? 'ok' : 'bad', health.ok ? 'Bridge online' : 'Bridge offline');
    const data = await api('/api/conversations');
    state.authenticated = true;
    const configuredLimit = Number(data.controlPolicy && data.controlPolicy.armLoopMaxDispatches);
    state.maxLoopDispatches = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 12;
    $('loopCount').max = String(state.maxLoopDispatches);
    if (Number($('loopCount').value) > state.maxLoopDispatches) {
      $('loopCount').value = String(state.maxLoopDispatches);
    }
    const list = realConversations(data.conversations || []);
    const previous = state.selectedId;
    state.conversations = list;
    if (!state.selectedId && list.length) {
      state.selectedId = list[0].conversationId;
    }
    renderConversationOptions();
    if (previous && list.some((c) => c.conversationId === previous)) {
      $('conversationSelect').value = previous;
      state.selectedId = previous;
    }
    renderStatus();
    if (!quiet) log('Status refreshed.');
  } catch (error) {
    state.authenticated = false;
    setPill($('bridgeStatus'), 'bad', 'Bridge error');
    $('runBtn').disabled = true;
    if (!quiet) log(`Refresh failed: ${error.message}`);
  }
}

function applyTemplate(name) {
  state.currentTemplate = name;
  for (const button of document.querySelectorAll('.template')) {
    button.classList.toggle('is-active', button.dataset.template === name);
  }
  $('promptInput').value = templates[name].prompt;
  $('allowEdits').checked = name === 'patch';
  renderEditPolicy();
}

function renderEditPolicy() {
  $('editPolicyText').textContent = $('allowEdits').checked
    ? 'File edits requested in prompt (effective capsule/sandbox still applies)'
    : 'No edits requested (not sandbox-enforced)';
}

function buildPrompt(meta = '') {
  const allowEdits = $('allowEdits').checked;
  const task = $('promptInput').value.trim();
  const policy = allowEdits
    ? 'This run may edit files only if necessary for the stated task. Keep edits narrow, reversible, and report every changed file. Do not commit, stage, push, delete, or rename files.'
    : 'No file edits are requested for this run. This is prompt-level guidance, not an OS or Codex sandbox. Do not modify, create, delete, rename, stage, commit, or push files.';
  return `${policy}\n\n${meta ? `${meta}\n\n` : ''}${task}`;
}

async function runOnce() {
  await runSequence(1);
}

async function runLoop() {
  const rawCount = Number($('loopCount').value);
  const fallback = Math.min(3, state.maxLoopDispatches);
  const count = Number.isFinite(rawCount) && rawCount > 0
    ? Math.min(Math.floor(rawCount), state.maxLoopDispatches)
    : fallback;
  $('loopCount').value = String(count);
  await runSequence(count);
}

function loopPrompt(basePrompt, runId, index, maxRuns, previousResult) {
  const lines = [
    `UI run id: ${runId}`,
    `Loop iteration: ${index} of ${maxRuns}`,
    '',
    'Work toward the user objective incrementally.',
    'Do one coherent step in this iteration.',
    'Run this iteration even if earlier iterations made progress.',
    'Only return exactly <<<LOOP_STOP>>> when continuing would be unsafe or impossible without human input.',
  ];
  if (previousResult) {
    lines.push(
      '',
      'Previous iteration result, for continuity:',
      previousResult.slice(0, 9000)
    );
  }
  return `${basePrompt}\n\n${lines.join('\n')}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function executeIteration(conversation, clientId, prompt, label, runId, auth) {
  appendRunResult(`\n## ${label}\n\n[GPT/UI -> Codex]\n${prompt}\n`);
  appendRunResult('[Bridge]\ndispatching with the current exact turn token...');

  const dispatch = await api('/api/dispatch', {
    method: 'POST',
    body: {
      conversationId: conversation.conversationId,
      clientId,
      prompt,
      armId: auth.armId,
      turnNonce: auth.turnNonce,
      assistantMessageSig: await sha256Hex(`${runId}\0${label}`),
      codeBlockHash: await sha256Hex(prompt),
    },
  });
  log(`${label}: dispatch ${dispatch.status}`);
  appendRunResult(`dispatch ${dispatch.status}`);
  if (dispatch.status !== 'accepted') {
    const reason = dispatch.rule || dispatch.status || 'unknown';
    throw new Error(`Dispatch did not start: ${reason}`);
  }

  setPill($('runStatus'), 'warn', 'Waiting result');
  appendRunResult('waiting for Codex result...');
  const result = await waitForResult(conversation.conversationId, clientId);
  log(`${label}: result ${result.ok ? 'OK' : 'FAILED'} ${result.jobId || ''}`);
  appendRunResult(`\n[Codex -> GPT/UI]\n${result.ok ? 'OK' : 'FAILED'} job=${result.jobId || '-'} turn=${result.turn || '-'}\n\n${result.finalMessage || '(no final message)'}`);

  const acknowledged = await api('/api/result/ack', {
    method: 'POST',
    body: {
      conversationId: conversation.conversationId,
      clientId,
      jobId: result.jobId,
      resultId: result.resultId,
    },
  });
  log(`${label}: acknowledged`);
  appendRunResult('\n[Bridge]\nacknowledged; this result is available as context for the next loop iteration.');
  return {
    result,
    nextAuth: {
      armId: acknowledged.armId || dispatch.armId || auth.armId,
      turnNonce: acknowledged.turnNonce || dispatch.turnNonce || null,
    },
  };
}

async function runSequence(maxRuns) {
  const c = selectedConversation();
  if (!c) return;
  const runId = `ui-${new Date().toISOString()}`;
  const basePrompt = buildPrompt(`UI run id: ${runId}`);
  if (!basePrompt.trim()) {
    log('No task prompt to run.');
    return;
  }

  state.running = true;
  state.cancelRequested = false;
  $('runBtn').disabled = true;
  $('runLoopBtn').disabled = true;
  $('resultSubhead').textContent = maxRuns === 1
    ? `Running ${templates[state.currentTemplate].title.toLowerCase()} in background Codex.`
    : `Running ${maxRuns} background Codex iterations.`;
  setRunResult([
    `# ${maxRuns === 1 ? 'Run once transcript' : `Run loop transcript (${maxRuns} iterations requested)`}`,
    '',
    'This local UI sends the task directly to Codex through the bridge. The transcript below shows each prompt dispatched to Codex and each Codex result that is fed into the next iteration.',
    '',
    `Workspace: ${c.workspaceDir || '-'}`,
    `Run id: ${runId}`,
  ].join('\n'));
  setPill($('runStatus'), 'warn', 'Arming');
  startProgress();

  try {
    const clientId = clientIdFor();
    const mode = await api('/api/mode', {
      method: 'POST',
      body: {
        conversationId: c.conversationId,
        clientId,
        action: maxRuns === 1 ? 'arm_once' : 'arm_loop',
        maxDispatches: maxRuns,
      },
    });
    let auth = {
      armId: mode.armId,
      turnNonce: mode.turnNonce,
    };
    if (!auth.armId || !auth.turnNonce) throw new Error('Bridge did not return an exact turn token.');
    log(maxRuns === 1 ? 'Armed one run.' : `Armed a bounded ${maxRuns}-run loop.`);
    let previousResult = '';
    let completedRuns = 0;
    for (let i = 1; i <= maxRuns; i++) {
      if (state.cancelRequested) {
        log(`Loop paused before run ${i}.`);
        break;
      }
      const prompt = maxRuns === 1
        ? basePrompt
        : loopPrompt(basePrompt, runId, i, maxRuns, previousResult);
      setPill($('runStatus'), 'warn', maxRuns === 1 ? 'Running' : `Loop ${i}/${maxRuns}`);
      const iteration = await executeIteration(
        c,
        clientId,
        prompt,
        maxRuns === 1 ? 'Run once' : `Loop ${i}/${maxRuns}`,
        runId,
        auth,
      );
      const result = iteration.result;
      auth = iteration.nextAuth;
      const finalMessage = result.finalMessage || '';
      completedRuns = i;
      previousResult = finalMessage;
      if (state.cancelRequested) {
        log(`Loop paused after ${i} run${i === 1 ? '' : 's'}.`);
        break;
      }
      if (!result.ok || /^<<<\s*LOOP_STOP\s*>>>$/i.test(finalMessage.trim())) {
        log(`Loop stopped after ${i} run${i === 1 ? '' : 's'}.`);
        break;
      }
    }
    $('resultOutput').classList.remove('flash');
    void $('resultOutput').offsetWidth;
    $('resultOutput').classList.add('flash');
    appendRunResult(`\n# ${maxRuns === 1 ? 'Run complete' : `Loop complete: ${completedRuns}/${maxRuns} iteration${maxRuns === 1 ? '' : 's'}`}`);
    $('resultSubhead').textContent = maxRuns === 1 ? 'Completed one run.' : `Loop completed ${completedRuns}/${maxRuns}.`;
    finishProgress(true);
    await refreshStatus(true);
  } catch (error) {
    finishProgress(false);
    setPill($('runStatus'), 'bad', 'Run failed');
    $('resultSubhead').textContent = 'Run failed.';
    appendRunResult(`\n# Run failed\n\n${error.stack || String(error)}`);
    log(`Run failed: ${error.message}`);
  } finally {
    state.running = false;
    renderStatus();
  }
}

async function waitForResult(conversationId, clientId) {
  const started = Date.now();
  while (Date.now() - started < 30 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const response = await api(`/api/result?conversationId=${encodeURIComponent(conversationId)}&clientId=${encodeURIComponent(clientId)}`);
    if (response.hasResult && response.result) return response.result;
  }
  throw new Error('Timed out waiting for Codex result.');
}

function renderRecoveredResult(result) {
  setRunResult([
    '# Recovered pending result',
    '',
    `Result id: ${result.resultId || '-'}`,
    `Job: ${result.jobId || '-'}`,
    `Turn: ${result.turn || '-'}`,
    `Status: ${result.ok ? 'OK' : 'FAILED'}`,
    '',
    result.finalMessage || '(no final message)',
  ].join('\n'));
  $('resultSubhead').textContent = 'Recovered after reload. Acknowledge it or keep it pending.';
}

async function recoverPendingResult() {
  const conversation = selectedConversation();
  if (!conversation || !conversation.hasPendingResult || state.recovering) return;
  state.recovering = true;
  renderRecoveryControls(conversation);
  try {
    const payload = await api(`/api/result?conversationId=${encodeURIComponent(conversation.conversationId)}&clientId=${encodeURIComponent(clientIdFor())}`);
    if (!payload.hasResult || !payload.result) {
      log('No pending result remains to recover.');
      await refreshStatus(true);
      return;
    }
    const result = payload.result;
    if (conversation.pendingResultId && result.resultId !== conversation.pendingResultId) {
      throw new Error('Pending resultId changed during recovery. Refresh before acknowledging.');
    }
    state.recoveredPending = { conversationId: conversation.conversationId, result };
    renderRecoveredResult(result);
    log(`Recovered pending result ${result.resultId}.`);
  } catch (error) {
    log(error.status === 401
      ? 'UI session expired. Reopen /ui/ to recover the pending result.'
      : `Result recovery failed: ${error.message}`);
  } finally {
    state.recovering = false;
    renderStatus();
  }
}

async function completeRecoveredResult(action) {
  const recovered = state.recoveredPending;
  const conversation = selectedConversation();
  if (!recovered || !conversation || recovered.conversationId !== conversation.conversationId || state.recovering) return;
  state.recovering = true;
  renderRecoveryControls(conversation);
  const result = recovered.result;
  try {
    const endpoint = action === 'ack' ? '/api/result/ack' : '/api/result/nack';
    await api(endpoint, {
      method: 'POST',
      body: {
        conversationId: conversation.conversationId,
        clientId: clientIdFor(),
        jobId: result.jobId,
        resultId: result.resultId,
        ...(action === 'nack' ? { reason: 'ui_recovery_deferred' } : {}),
      },
    });
    log(action === 'ack'
      ? `Acknowledged recovered result ${result.resultId}.`
      : `Kept recovered result ${result.resultId} pending and paused the loop.`);
    state.recoveredPending = null;
    $('resultSubhead').textContent = action === 'ack'
      ? 'Recovered result acknowledged.'
      : 'Recovered result remains pending.';
    await refreshStatus(true);
  } catch (error) {
    log(`Recovered result ${action.toUpperCase()} failed: ${error.message}`);
  } finally {
    state.recovering = false;
    renderStatus();
  }
}

async function pauseConversation() {
  const c = selectedConversation();
  if (!c) return;
  state.cancelRequested = true;
  try {
    await api('/api/mode', {
      method: 'POST',
      body: {
        conversationId: c.conversationId,
        clientId: clientIdFor(),
        action: 'chat',
        reason: 'ui_pause',
      },
    });
    log(state.running ? 'Pause requested. Current run may finish before the loop stops.' : 'Paused conversation.');
    await refreshStatus(true);
  } catch (error) {
    log(`Pause failed: ${error.message}`);
  }
}

async function copyResult() {
  const text = state.lastResult || $('resultOutput').textContent || '';
  await navigator.clipboard.writeText(text);
  log('Copied result.');
}

function bindEvents() {
  $('refreshBtn').addEventListener('click', () => refreshStatus(false));
  $('conversationSelect').addEventListener('change', (event) => {
    state.selectedId = event.target.value;
    state.recoveredPending = null;
    renderStatus();
  });
  $('runBtn').addEventListener('click', runOnce);
  $('runLoopBtn').addEventListener('click', runLoop);
  $('pauseBtn').addEventListener('click', pauseConversation);
  $('recoverBtn').addEventListener('click', recoverPendingResult);
  $('ackRecoveredBtn').addEventListener('click', () => completeRecoveredResult('ack'));
  $('nackRecoveredBtn').addEventListener('click', () => completeRecoveredResult('nack'));
  $('copyBtn').addEventListener('click', copyResult);
  $('clearLogBtn').addEventListener('click', () => {
    $('activityLog').innerHTML = '';
  });
  for (const button of document.querySelectorAll('.template')) {
    button.addEventListener('click', () => applyTemplate(button.dataset.template));
  }
  $('allowEdits').addEventListener('change', renderEditPolicy);
}

async function init() {
  bindEvents();
  applyTemplate('audit');
  await refreshStatus(true);
  log(state.authenticated ? 'Console ready.' : 'Local UI session unavailable. Reopen /ui/.');
  setInterval(() => refreshStatus(true), 6000);
}

init();
