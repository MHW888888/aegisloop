'use strict';

const cfg = window.AEGISLOOP_UI_CONFIG || {};
const token = cfg.apiToken || '';
const clientKey = 'aegisloop-ui-client-id';
const state = {
  conversations: [],
  selectedId: '',
  running: false,
  currentTemplate: 'audit',
  lastResult: '',
  progressTimer: null,
};

const $ = (id) => document.getElementById(id);

const templates = {
  audit: {
    title: 'Inspect workspace',
    prompt: [
      'Run a read-only inspection of the current workspace.',
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

function clientIdFor(conversation) {
  if (conversation && conversation.leaderLease && conversation.leaderLease.clientId) {
    return conversation.leaderLease.clientId;
  }
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
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-AegisLoop-Token': token,
    },
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
    throw new Error(detail);
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

function renderStatus() {
  const c = selectedConversation();
  if (!c) {
    $('modeText').textContent = '-';
    $('turnText').textContent = '-';
    $('pendingText').textContent = '-';
    $('jobText').textContent = '-';
    $('workspacePath').textContent = 'No registered AegisLoop conversation.';
    setPill($('runStatus'), 'warn', 'No workspace');
    $('runBtn').disabled = true;
    $('runLoopBtn').disabled = true;
    return;
  }

  $('modeText').textContent = `${c.conversationMode || 'chat'} / ${c.loopState || 'paused'}`;
  $('turnText').textContent = String(c.turn || 0);
  $('pendingText').textContent = c.hasPendingResult ? 'yes' : 'no';
  $('jobText').textContent = c.lastJobId || '-';
  $('workspacePath').textContent = c.workspaceDir || 'No workspace path';

  if (state.running || c.conversationMode === 'running') {
    setPill($('runStatus'), 'warn', 'Codex running');
  } else if (c.hasPendingResult) {
    setPill($('runStatus'), 'warn', 'Result pending');
  } else if (c.conversationMode === 'chat') {
    setPill($('runStatus'), 'ok', 'Ready');
  } else {
    setPill($('runStatus'), 'neutral', c.conversationMode || 'Idle');
  }

  $('runBtn').disabled = state.running || !token;
  $('runLoopBtn').disabled = state.running || !token;
}

async function refreshStatus(quiet = false) {
  try {
    const health = await fetch('/health').then((r) => r.json());
    setPill($('bridgeStatus'), health.ok ? 'ok' : 'bad', health.ok ? 'Bridge online' : 'Bridge offline');
    const data = await api('/api/conversations');
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
}

function buildPrompt(meta = '') {
  const allowEdits = $('allowEdits').checked;
  const task = $('promptInput').value.trim();
  const policy = allowEdits
    ? 'This run may edit files only if necessary for the stated task. Keep edits narrow, reversible, and report every changed file. Do not commit, stage, push, delete, or rename files.'
    : 'This run is read-only. Do not modify, create, delete, rename, stage, commit, or push files.';
  return `${policy}\n\n${meta ? `${meta}\n\n` : ''}${task}`;
}

async function runOnce() {
  await runSequence(1);
}

async function runLoop() {
  const count = Math.max(2, Math.min(12, Number($('loopCount').value || 3)));
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
    'If the objective is already complete or the next step requires human confirmation, begin your final response with <<<LOOP_STOP>>> and explain why.',
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

async function executeIteration(conversation, clientId, prompt, label) {
  const mode = await api('/api/mode', {
    method: 'POST',
    body: {
      conversationId: conversation.conversationId,
      clientId,
      action: 'arm_once',
    },
  });
  log(`${label}: armed ${mode.armNonce}`);
  $('resultOutput').textContent = `${label}: dispatching task to Codex...`;

  const dispatch = await api('/api/dispatch', {
    method: 'POST',
    body: {
      conversationId: conversation.conversationId,
      clientId,
      prompt,
      armNonce: mode.armNonce,
    },
  });
  log(`${label}: dispatch ${dispatch.status}`);
  if (!['accepted', 'busy', 'pending_result_exists'].includes(dispatch.status)) {
    throw new Error(`Dispatch did not start: ${dispatch.status}`);
  }

  setPill($('runStatus'), 'warn', 'Waiting result');
  $('resultOutput').textContent = `${label}: Codex is running in the background. Waiting for result...`;
  const result = await waitForResult(conversation.conversationId);
  log(`${label}: result ${result.ok ? 'OK' : 'FAILED'} ${result.jobId || ''}`);

  await api('/api/result/ack', {
    method: 'POST',
    body: {
      conversationId: conversation.conversationId,
      clientId,
      jobId: result.jobId,
      resultId: result.resultId,
    },
  });
  log(`${label}: acknowledged`);
  return result;
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
  $('runBtn').disabled = true;
  $('runLoopBtn').disabled = true;
  $('resultSubhead').textContent = maxRuns === 1
    ? `Running ${templates[state.currentTemplate].title.toLowerCase()} in background Codex.`
    : `Running ${maxRuns} background Codex iterations.`;
  $('resultOutput').textContent = maxRuns === 1 ? 'Arming one run...' : `Starting loop: 0 / ${maxRuns}`;
  setPill($('runStatus'), 'warn', 'Arming');
  startProgress();

  try {
    const clientId = clientIdFor(c);
    const results = [];
    let previousResult = '';
    for (let i = 1; i <= maxRuns; i++) {
      const prompt = maxRuns === 1
        ? basePrompt
        : loopPrompt(basePrompt, runId, i, maxRuns, previousResult);
      setPill($('runStatus'), 'warn', maxRuns === 1 ? 'Running' : `Loop ${i}/${maxRuns}`);
      const result = await executeIteration(c, clientId, prompt, maxRuns === 1 ? 'Run once' : `Loop ${i}/${maxRuns}`);
      const finalMessage = result.finalMessage || '';
      results.push(`## ${maxRuns === 1 ? 'Run once' : `Loop ${i}/${maxRuns}`} ${result.ok ? 'OK' : 'FAILED'}\n\n${finalMessage || '(no final message)'}`);
      previousResult = finalMessage;
      state.lastResult = results.join('\n\n---\n\n');
      $('resultOutput').textContent = state.lastResult;
      if (!result.ok || /^<<<\s*LOOP_STOP\s*>>>/i.test(finalMessage.trim())) {
        log(`Loop stopped after ${i} run${i === 1 ? '' : 's'}.`);
        break;
      }
    }
    $('resultOutput').classList.remove('flash');
    void $('resultOutput').offsetWidth;
    $('resultOutput').classList.add('flash');
    $('resultSubhead').textContent = maxRuns === 1 ? 'Completed one run.' : 'Loop completed.';
    finishProgress(true);
    await refreshStatus(true);
  } catch (error) {
    finishProgress(false);
    setPill($('runStatus'), 'bad', 'Run failed');
    $('resultSubhead').textContent = 'Run failed.';
    $('resultOutput').textContent = error.stack || String(error);
    log(`Run failed: ${error.message}`);
  } finally {
    state.running = false;
    renderStatus();
  }
}

async function waitForResult(conversationId) {
  const started = Date.now();
  while (Date.now() - started < 30 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const response = await api(`/api/result?conversationId=${encodeURIComponent(conversationId)}`);
    if (response.hasResult && response.result) return response.result;
  }
  throw new Error('Timed out waiting for Codex result.');
}

async function pauseConversation() {
  const c = selectedConversation();
  if (!c) return;
  try {
    await api('/api/mode', {
      method: 'POST',
      body: {
        conversationId: c.conversationId,
        clientId: clientIdFor(c),
        action: 'chat',
        reason: 'ui_pause',
      },
    });
    log('Paused conversation.');
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
    renderStatus();
  });
  $('runBtn').addEventListener('click', runOnce);
  $('runLoopBtn').addEventListener('click', runLoop);
  $('pauseBtn').addEventListener('click', pauseConversation);
  $('copyBtn').addEventListener('click', copyResult);
  $('clearLogBtn').addEventListener('click', () => {
    $('activityLog').innerHTML = '';
  });
  for (const button of document.querySelectorAll('.template')) {
    button.addEventListener('click', () => applyTemplate(button.dataset.template));
  }
}

async function init() {
  bindEvents();
  applyTemplate('audit');
  if (!token) {
    setPill($('bridgeStatus'), 'bad', 'Token missing');
    $('runBtn').disabled = true;
    $('runLoopBtn').disabled = true;
    log('Bridge token is missing from /ui/config.js.');
    return;
  }
  await refreshStatus(true);
  log('Console ready.');
  setInterval(() => refreshStatus(true), 6000);
}

init();
