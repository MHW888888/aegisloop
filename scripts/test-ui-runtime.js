'use strict';

const assert = require('assert');
const crypto = require('crypto').webcrypto;
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const APP_PATH = path.join(ROOT, 'ui', 'app.js');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function element() {
  return {
    className: '',
    textContent: '',
    value: '',
    title: '',
    disabled: false,
    hidden: false,
    checked: false,
    innerHTML: '',
    scrollHeight: 0,
    scrollTop: 0,
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    append() {},
    prepend() {},
    addEventListener() {},
  };
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    async text() {
      return JSON.stringify(value);
    },
  };
}

function loadApp({ sessionStore = storage(), fetchImpl, timeoutMs = 30 } = {}) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return element();
    },
  };
  const source = fs.readFileSync(APP_PATH, 'utf8')
    .replace('const API_TIMEOUT_MS = 8000;', `const API_TIMEOUT_MS = ${timeoutMs};`)
    .replace('const RESULT_POLL_MS = 2500;', 'const RESULT_POLL_MS = 1;')
    .replace(/\ninit\(\);\s*$/, [
      '',
      'globalThis.__aegisUiTest = { clientIdFor, api, refreshStatus, shortWorkspace, state, renderStatus, completeRecoveredResult, realConversations, runSequence, pauseConversation, waitForResult };',
      '',
    ].join('\n'));
  const context = {
    AbortController,
    TextEncoder,
    clearInterval,
    clearTimeout,
    console,
    crypto,
    document,
    fetch: fetchImpl || (async () => jsonResponse({ ok: true })),
    localStorage: new Proxy({}, {
      get() {
        throw new Error('localStorage must not hold the per-tab leader identity');
      },
    }),
    navigator: { clipboard: { writeText: async () => {} } },
    sessionStorage: sessionStore,
    setInterval,
    setTimeout,
  };
  vm.runInNewContext(source, context, { filename: APP_PATH });
  return { ...context.__aegisUiTest, elements };
}

async function main() {
  const tabAStorage = storage();
  const tabBStorage = storage();
  const tabA = loadApp({ sessionStore: tabAStorage });
  const tabB = loadApp({ sessionStore: tabBStorage });
  const tabAId = tabA.clientIdFor();
  const tabBId = tabB.clientIdFor();
  assert.match(tabAId, /^ui-/);
  assert.notStrictEqual(tabAId, tabBId, 'separate UI tabs must not share a leader clientId');
  assert.strictEqual(tabA.clientIdFor(), tabAId, 'one page must keep a stable clientId');

  const reloadedTabA = loadApp({ sessionStore: tabAStorage });
  assert.notStrictEqual(reloadedTabA.clientIdFor(), tabAId, 'a new document must have its own clientId');
  const copiedTab = loadApp({ sessionStore: storage({ 'aegisloop-ui-client-id': tabAId }) });
  assert.notStrictEqual(copiedTab.clientIdFor(), tabAId, 'copied sessionStorage must not clone leader authority');
  assert.strictEqual(tabA.shortWorkspace('C:\\Users\\test\\repo'), 'repo');
  assert.strictEqual(tabA.shortWorkspace('/Users/test/repo'), 'repo');

  const hanging = loadApp({
    timeoutMs: 20,
    fetchImpl: (_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  await assert.rejects(
    hanging.api('/api/conversations'),
    error => error && error.code === 'bridge_timeout',
    'a stalled UI request must fail with bridge_timeout',
  );

  let releaseHealth;
  let fetchCount = 0;
  const singleFlight = loadApp({
    fetchImpl: async (requestPath) => {
      fetchCount += 1;
      if (requestPath === '/health') {
        return new Promise(resolve => { releaseHealth = () => resolve(jsonResponse({ ok: true })); });
      }
      return jsonResponse({ controlPolicy: { armLoopMaxDispatches: 4 }, conversations: [] });
    },
  });
  const firstRefresh = singleFlight.refreshStatus(true);
  await Promise.resolve();
  assert.strictEqual(await singleFlight.refreshStatus(true), false, 'overlapping status refreshes must be skipped');
  assert.strictEqual(fetchCount, 1, 'an overlapping refresh must not start another request');
  releaseHealth();
  assert.strictEqual(await firstRefresh, true);
  assert.strictEqual(fetchCount, 2);
  assert.strictEqual(singleFlight.state.refreshing, false);

  const unavailable = loadApp({
    fetchImpl: async () => { throw new Error('offline'); },
  });
  unavailable.state.conversations = [{
    conversationId: 'conversation-test',
    workspaceDir: 'C:\\workspace',
    conversationMode: 'chat',
  }];
  unavailable.state.selectedId = 'conversation-test';
  assert.strictEqual(await unavailable.refreshStatus(true), false);
  assert.strictEqual(unavailable.elements.get('runBtn').disabled, true);
  assert.strictEqual(unavailable.elements.get('runLoopBtn').disabled, true);
  assert.strictEqual(unavailable.elements.get('runStatus').textContent, 'Unavailable');

  const expiredSession = loadApp({
    fetchImpl: async () => jsonResponse({ error: 'auth_required' }, 401),
  });
  expiredSession.state.conversations = unavailable.state.conversations;
  expiredSession.state.selectedId = 'conversation-test';
  assert.strictEqual(await expiredSession.refreshStatus(true), false);
  assert.strictEqual(expiredSession.elements.get('runBtn').disabled, true);
  assert.strictEqual(expiredSession.elements.get('runLoopBtn').disabled, true);
  assert.strictEqual(expiredSession.elements.get('runStatus').textContent, 'Session expired');

  const conflict = loadApp({
    fetchImpl: async () => jsonResponse({ ok: false, status: 'leader_conflict' }, 409),
  });
  await assert.rejects(conflict.api('/api/result/ack'), /leader_conflict/);

  for (const body of [{ ok: false, status: 'leader_conflict' }, {}, [], null]) {
    const invalid = loadApp({ fetchImpl: async () => jsonResponse(body) });
    await assert.rejects(invalid.api('/api/mode', { method: 'POST', body: {} }), /leader_conflict|invalid_bridge_response/);
  }
  const malformed = loadApp({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>proxy</html>' }) });
  await assert.rejects(malformed.api('/health'), /invalid_bridge_response/);
  assert.strictEqual(tabA.realConversations([{
    conversationId: 'YOUR_CHATGPT_CONVERSATION_ID', codexSessionId: 'YOUR_CODEX_SESSION_ID', workspaceDir: '/YOUR_WORKSPACE',
  }]).length, 0, 'example bindings must not appear ready');

  const configured = { conversationId: 'route-a', codexSessionId: 'session-a', workspaceDir: '/sample', conversationMode: 'chat' };
  let readAttempts = 0;
  const retry = loadApp({ fetchImpl: async (requestPath, options) => {
    assert.strictEqual(options.method, 'GET');
    assert.match(requestPath, /conversationId=route-a/);
    if (++readAttempts === 1) throw new TypeError('Failed to fetch');
    return jsonResponse({ hasResult: true, result: { resultId: 'r1', jobId: 'j1', ok: true } });
  } });
  assert.strictEqual((await retry.waitForResult('route-a', 'client', 'j1')).resultId, 'r1');
  assert.strictEqual(readAttempts, 2, 'transient read retries must not redispatch');
  for (const status of [401, 403, 409]) {
    let requests = 0;
    const fatal = loadApp({ fetchImpl: async () => { requests++; return jsonResponse({ error: 'denied' }, status); } });
    await assert.rejects(fatal.waitForResult('route-a', 'client', 'j1'), /denied/);
    assert.strictEqual(requests, 1, 'authority failures must never retry');
  }
  const mismatch = loadApp({ fetchImpl: async () => jsonResponse({ hasResult: true, result: { jobId: 'wrong', resultId: 'r2' } }) });
  await assert.rejects(mismatch.waitForResult('route-a', 'client', 'j1'), /result_job_mismatch/);
  let outageReads = 0;
  const outage = loadApp({ fetchImpl: async () => { outageReads++; throw new TypeError('offline'); } });
  await assert.rejects(outage.waitForResult('route-a', 'client', 'j1'), /offline/);
  assert.strictEqual(outageReads, 4, 'read retries must be bounded');
  assert.strictEqual(outage.state.reconnecting, false);

  let pauseBody;
  const pause = loadApp({ fetchImpl: async (requestPath, options) => {
    if (options.method === 'POST') {
      pauseBody = JSON.parse(options.body);
      return jsonResponse({ ok: false, status: 'leader_conflict' });
    }
    return jsonResponse({ ok: true });
  } });
  Object.assign(pause.state, {
    conversations: [configured, { ...configured, conversationId: 'route-b' }],
    selectedId: 'route-b', activeConversationId: 'route-a', running: true, authenticated: true,
  });
  pause.renderStatus();
  assert.strictEqual(pause.elements.get('conversationSelect').disabled, true);
  await pause.pauseConversation();
  assert.strictEqual(pauseBody.conversationId, 'route-a', 'Pause must target the active run, even with a stale selection');
  assert.strictEqual(pause.state.cancelRequested, false, 'rejected Pause must not claim success');
  assert.strictEqual(pause.elements.get('runStatus').textContent, 'Needs attention');

  for (const block of ['empty', 'running', 'authentication', 'leader', 'recovering', 'pending', 'active', 'recovery']) {
    let requests = 0;
    const guarded = loadApp({ fetchImpl: async () => { requests++; return jsonResponse({ ok: true }); } });
    guarded.state.conversations = [{ ...configured,
      hasPendingResult: block === 'pending', activeDispatchHash: block === 'active' ? 'hash' : null,
      recoveryRequired: block === 'recovery',
      leaderLease: block === 'leader' ? { clientId: 'other', expiresAt: Date.now() + 15000 } : null,
    }];
    guarded.state.authenticated = block !== 'authentication';
    guarded.state.running = block === 'running';
    guarded.state.recovering = block === 'recovering';
    guarded.renderStatus();
    guarded.elements.get('promptInput').value = block === 'empty' ? '  ' : 'Inspect';
    await guarded.runSequence(1);
    assert.strictEqual(requests, 0, `${block}: no arm or dispatch allowed`);
  }

  for (const blockedBy of ['authentication', 'leader', 'running', 'pending_result', 'result_id']) {
    let writes = 0;
    const recovery = loadApp({ fetchImpl: async () => {
      writes += 1;
      return jsonResponse({ ok: true });
    } });
    const conversation = {
      conversationId: 'conversation-test',
      conversationMode: 'chat',
      hasPendingResult: blockedBy !== 'pending_result',
      pendingResultId: blockedBy === 'result_id' ? 'result-new' : 'result-test',
      leaderLease: blockedBy === 'leader' ? { clientId: 'other-client', expiresAt: Date.now() + 15000 } : null,
    };
    recovery.state.conversations = [conversation];
    recovery.state.selectedId = conversation.conversationId;
    recovery.state.authenticated = blockedBy !== 'authentication';
    recovery.state.running = blockedBy === 'running';
    recovery.state.recoveredPending = {
      conversationId: conversation.conversationId,
      result: { resultId: 'result-test', jobId: 'job-test' },
    };
    recovery.renderStatus();
    assert.strictEqual(recovery.elements.get('ackRecoveredBtn').disabled, true, `${blockedBy}: ACK must be disabled`);
    assert.strictEqual(recovery.elements.get('nackRecoveredBtn').disabled, true, `${blockedBy}: NACK must be disabled`);
    await recovery.completeRecoveredResult('ack');
    await recovery.completeRecoveredResult('nack');
    assert.strictEqual(writes, 0, `${blockedBy}: stale handlers must not send writes`);
  }

  console.log('UI runtime isolation and polling checks passed');
}

main().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
