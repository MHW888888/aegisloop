/**
 * AegisLoop - content.js  (ONE per tab, only handles its own conversationId)
 * ============================================================================
 * IMPORTANT: comments and UI labels in this file are intentionally ASCII-only.
 * The previous version was corrupted by a UTF-8 <-> GBK round-trip (mojibake)
 * that ate newlines and commented out real code lines. Keeping this file ASCII
 * makes it immune to that on a Chinese-Windows toolchain. If you must add
 * Chinese, add it through a UTF-8-safe editor and re-check `node --check`.
 *
 * What it does:
 *   1. Read this page's conversationId from the URL, register the fixed
 *      one-to-one binding with the bridge (codexSessionId is fixed locally).
 *   2. Watch GPT's latest reply, wait until streaming has finished.
 *   3. Extract a ```codex block -> send to bridge -> bridge runs Codex.
 *   4. Codex result comes back -> type it into the ChatGPT composer the
 *      CORRECT way -> send -> CONFIRM by reading the new user message back.
 *   5. No codex block -> pause (and auto-resume when a fresh codex block shows).
 *   6. Every stop/pause is either human-confirmed or a pause awaiting you.
 *
 * The ONLY part that breaks on ChatGPT redesigns is the SELECTORS block below.
 * If the loop stalls, turn on debug under Diagnostics and watch the
 * console for whether it finds the composer / send button / message nodes,
 * then adjust SELECTORS. Nothing else should need changing.
 * ============================================================================
 */
(() => {
  'use strict';
  if (window.__LE_LOADED__) return;          // guard against double injection
  window.__LE_LOADED__ = true;
  const CONTENT_VERSION = '0.3.25';
  const CONTRACT_VERSION = 'le-3.3';
  const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:17380';
  const FAST_POLL_MS = 800;
  const IDLE_POLL_MS = 3500;
  const DOM_NUDGE_MS = 250;
  const SEED_FRESH_CODEX_CONFIRM_MS = 15000;
  const CONTENT_BRIDGE_TIMEOUT_MS = 10000;
  const NO_CODEX_GRACE_MS = 5000;
  const ASSISTANT_STABLE_BEFORE_REPAIR_MS = 9000;
  const TOOL_UNAVAILABLE_REPAIR_MS = 1200;
  const RESULT_DELIVERY_HOLD_MS = 10 * 60 * 1000;
  const LEADER_HEARTBEAT_MS = 5000;

  // ----------------------------------------------------------------------------
  // SELECTORS - fix these first if the DOM changes (all have fallbacks)
  // ----------------------------------------------------------------------------
  function pageElement(selector) {
    return Array.from(document.querySelectorAll(selector)).find(el => !el.closest('#le-panel')) || null;
  }
  const SEL = {
    composer() {
      return pageElement('#prompt-textarea')
          || pageElement('form [contenteditable="true"]')
          || pageElement('div[contenteditable="true"]')
          || pageElement('form textarea')
          || pageElement('textarea');
    },
    sendButton() {
      return pageElement('button[data-testid="send-button"]')
          || pageElement('button[aria-label*="Send" i]')
          || pageElement('form button[type="submit"]');
    },
    stopButton() {
      return pageElement('button[data-testid="stop-button"]')
          || pageElement('button[aria-label*="Stop" i]');
    },
    // All message nodes, with role + text + any code blocks rendered inside.
    messages() {
      let nodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
      if (nodes.length) return nodes.map(n => ({
        role: n.getAttribute('data-message-author-role'),
        text: (n.innerText || '').trim(),
        codeBlocks: codeBlocksFromNode(n),
        node: n,
      }));
      nodes = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn"]'));
      return nodes.map((n, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        text: (n.innerText || '').trim(),
        codeBlocks: codeBlocksFromNode(n),
        node: n,
      }));
    },
  };

  // ----------------------------------------------------------------------------
  // Contract text (teaches GPT how to end each turn)
  // ----------------------------------------------------------------------------
  function contractText() {
    const armId = LE.armId || 'ARM_ID_FROM_PANEL';
    const turnNonce = LE.turnNonce || LE.armNonce || 'TURN_TOKEN_FROM_PANEL';
    return [
      '',
      `[AegisLoop protocol ${CONTRACT_VERSION}]`,
      'Evaluate the Codex result above, then give the next step.',
      'ChatGPT may offer built-in Codex, but this runner uses the separate AegisLoop local bridge route.',
      "Do not start or invoke ChatGPT's built-in Codex from this reply.",
      'The turn token is visible and non-secret. It only proves freshness for this armed turn.',
      'If you are in a Pro or reasoning mode, do not answer with a tool-availability disclaimer.',
      'To use local Codex, write the next instruction as plain JSON inside a fenced ```codex block.',
      'Your reply MUST end with exactly one of these:',
      '1) one fenced ```codex block with JSON containing the current arm_id, turn_nonce, and the next instruction. Example:',
      '```codex',
      `{"aegisloop":true,"arm_id":"${armId}","turn_nonce":"${turnNonce}","arm_nonce":"${turnNonce}","prompt":"Next task. Keep research_only=true and approved_for_scoring=false."}`,
      '```',
      '2) if this loop should stop, output exactly one line:',
      '<<<LOOP_STOP>>>',
      'Do not put codexSessionId or workspaceDir inside the codex block.',
      'Do not output trading advice, price prediction, top list, production signal,',
      'commit, push, or anything that violates the local research gate.',
    ].join('\n');
  }

  // Sent automatically when GPT replied but gave no usable codex block, to nudge
  // it back onto the protocol. Bounded by MAX_REFORMAT so it never spams.
  function reformatMsg() {
    const armId = LE.armId || 'ARM_ID_FROM_PANEL';
    const turnNonce = LE.turnNonce || LE.armNonce || 'TURN_TOKEN_FROM_PANEL';
    return [
      '[AegisLoop] Your last reply had no usable fenced codex block.',
      "This runner uses the AegisLoop local bridge, not ChatGPT's built-in Codex.",
      'Do not start built-in Codex, call tools, or search for tools.',
      'Do not answer that the tool is unavailable; AegisLoop reads visible page text after you reply.',
      'Reply with ONLY one JSON fenced codex block containing arm_id="' + armId + '", turn_nonce="' + turnNonce + '", and the next instruction,',
      'or output exactly one line <<<LOOP_STOP>>> if the task is complete. Nothing else.',
    ].join('\n');
  }

  function starterSeed() {
    return [
      'Read the AegisLoop GPT brief above if present.',
      'This is a runner thread, not a normal Q&A thread.',
      "Use the AegisLoop local bridge route. Do not start ChatGPT's built-in Codex or call ChatGPT tools.",
      'AegisLoop works by reading your fenced codex JSON block from this page.',
      'If you are a Pro or reasoning model, still write page text instead of looking for a tool.',
      'Give the smallest safe next local Codex task for the current project/branch/objective.',
      'If the task should stop, reply exactly <<<LOOP_STOP>>>.',
    ].join('\n');
  }

  function looksLikeToolUnavailable(text) {
    return /(tool|tools).{0,40}(unavailable|not available|cannot be used|can't be used)|cannot access.{0,40}(tool|tools)|no built-?in tool|(\u65e0\u6cd5|\u6ca1\u6709).{0,20}\u5de5\u5177/i.test(String(text || ''));
  }

  // ----------------------------------------------------------------------------
  // State
  // ----------------------------------------------------------------------------
  const LE = {
    clientId: loadClientId(),
    conversationId: null,
    bound: false,
    codexSessionId: null,
    workspaceDir: null,
    bridgeUrl: DEFAULT_BRIDGE_URL,
    bridgeError: null,
    apiToken: null,
    authRequired: false,
    conversationMode: 'chat',
    armId: null,
    turnNonce: null,
    armNonce: null,
    armExpiresAt: 0,
    armDispatches: 0,
    armMaxDispatches: 0,
    bridgeOk: false,
    loopState: 'running',          // mirrors the bridge: running | paused | halted
    pauseReason: null,
    blockedPayload: null,
    capsule: null,
    briefing: null,
    local: 'idle',                 // idle | awaiting_assistant | dispatching | inserting
    lastSig: null,                 // signature of the assistant message already handled
    initializedLatestSig: false,
    prevAssistantText: '',
    reformatCount: 0,              // bounded re-prompts since last real progress
    missingCodexSig: null,
    missingCodexFirstSeenAt: 0,
    missingCodexStableSince: 0,
    needsProtocolFix: false,
    seedSubmitUnconfirmed: false,
    armPending: false,
    resultDeliveryUnconfirmed: null,
    selectorHealth: null,
    leaderLease: null,
    leaderIsCurrent: false,
    lastControlError: null,
    lastSubmitMsgId: null,
    lastLeaderHeartbeatAt: 0,
    debug: false,
    ticking: false,
    userHold: false,               // true after a manual Pause, blocks auto-resume
  };
  const MAX_REFORMAT = 3;
  function log(...a) { if (LE.debug) console.log('%c[LE]', 'color:#0a0', ...a); }

  function loadClientId() {
    // Duplicated tabs can inherit sessionStorage; only this content instance owns its identity.
    return 'tab-' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2));
  }

  function resetProtocolRecovery() {
    LE.reformatCount = 0;
    LE.missingCodexSig = null;
    LE.missingCodexFirstSeenAt = 0;
    LE.missingCodexStableSince = 0;
    LE.needsProtocolFix = false;
  }

  function resetTransientForConversation(id) {
    LE.conversationId = id || null;
    LE.bound = false;
    LE.codexSessionId = null;
    LE.workspaceDir = null;
    LE.conversationMode = 'chat';
    LE.armId = null;
    LE.turnNonce = null;
    LE.armNonce = null;
    LE.armExpiresAt = 0;
    LE.armDispatches = 0;
    LE.armMaxDispatches = 0;
    LE.loopState = 'running';
    LE.pauseReason = null;
    LE.blockedPayload = null;
    LE.capsule = null;
    LE.briefing = null;
    LE.local = 'idle';
    LE.lastSig = null;
    LE.initializedLatestSig = false;
    LE.prevAssistantText = '';
    resetProtocolRecovery();
    LE.seedSubmitUnconfirmed = false;
    LE.resultDeliveryUnconfirmed = null;
    LE.userHold = false;
    LE.selectorHealth = null;
    LE.leaderLease = null;
    LE.leaderIsCurrent = false;
    LE.lastControlError = null;
    LE.lastSubmitMsgId = null;
    LE.lastLeaderHeartbeatAt = 0;
    log('conversation route changed; transient state reset', id);
  }

  function syncArmState(json) {
    if (!json) return;
    LE.armId = json.armId || null;
    LE.turnNonce = json.turnNonce || json.armNonce || null;
    LE.armNonce = json.armNonce || json.turnNonce || null;
    LE.armExpiresAt = json.armExpiresAt || 0;
    LE.armDispatches = json.armDispatches || 0;
    LE.armMaxDispatches = json.armMaxDispatches || 0;
  }

  // ----------------------------------------------------------------------------
  // Bridge comms (via background relay, to avoid https->http mixed content)
  // ----------------------------------------------------------------------------
  function bridge(pathAndQuery, method, body) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        LE.bridgeError = 'bridge_timeout';
        finish({
          ok: false,
          status: 504,
          error: 'bridge_timeout',
          json: { error: 'bridge_timeout' },
        });
      }, CONTENT_BRIDGE_TIMEOUT_MS);
      try {
        chrome.runtime.sendMessage({ type: 'BRIDGE', path: pathAndQuery, method, body, token: LE.apiToken, bridgeUrl: LE.bridgeUrl }, (resp) => {
          const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
          if (err || !resp) {
            LE.bridgeError = err || 'empty bridge response';
            return finish({ ok: false, error: LE.bridgeError });
          }
          if (!resp.ok) LE.bridgeError = resp.error || 'bridge request failed';
          else LE.bridgeError = null;
          if (resp.status === 401) LE.authRequired = true;
          finish(resp);
        });
      } catch (e) {
        LE.bridgeError = String(e && e.message || e);
        finish({ ok: false, error: LE.bridgeError });
      }
    });
  }

  function bridgeProblem(r, fallback) {
    if (!r) return fallback || 'bridge_error';
    const json = r.json || {};
    if (r.status === 401) return 'auth_required';
    if (r.status === 403) return 'origin_not_allowed';
    if (r.status === 504 || r.error === 'bridge_timeout' || json.error === 'bridge_timeout') return 'bridge_timeout';
    if (r.status === 409) return json.error || json.status || 'leader_conflict';
    return json.error || json.status || r.error || fallback || ('http_' + (r.status || 'error'));
  }

  const TURN_TOKEN_ERRORS = new Set([
    'nonce_replay_blocked',
    'arm_id_mismatch',
    'missing_turn_nonce',
    'turn_nonce_mismatch',
    'turn_nonce_expired',
    'dispatch_metadata_missing',
  ]);

  function isWriteOk(r) {
    return !!(r && r.ok && r.status >= 200 && r.status < 300 && r.json && r.json.ok === true && !r.json.error);
  }

  function surfaceWriteFailure(r, fallback) {
    const reason = bridgeProblem(r, fallback);
    LE.lastControlError = reason;
    if (reason === 'auth_required') LE.authRequired = true;
    if (reason === 'bridge_timeout') LE.bridgeError = 'bridge_timeout';
    if (reason === 'leader_conflict') LE.leaderIsCurrent = false;
    log('bridge write failed', reason, r && r.json ? r.json : r);
    renderPanel();
    return reason;
  }

  async function postControl(pathAndQuery, body) {
    const payload = { ...(body || {}), clientId: LE.clientId };
    const r = await bridge(pathAndQuery, 'POST', payload);
    if (payload.conversationId && (payload.conversationId !== LE.conversationId || payload.conversationId !== readConversationId())) {
      scheduleTick(0);
      return null;
    }
    if (isWriteOk(r)) {
      LE.lastControlError = null;
      if (r.json && Object.prototype.hasOwnProperty.call(r.json, 'conversationMode')) {
        LE.conversationMode = r.json.conversationMode || LE.conversationMode;
      }
      if (r.json && Object.prototype.hasOwnProperty.call(r.json, 'loopState')) {
        LE.loopState = r.json.loopState || LE.loopState;
      }
      if (r.json && Object.prototype.hasOwnProperty.call(r.json, 'pauseReason')) {
        LE.pauseReason = r.json.pauseReason || null;
      }
      if (r.json && (
        Object.prototype.hasOwnProperty.call(r.json, 'armId')
        || Object.prototype.hasOwnProperty.call(r.json, 'turnNonce')
        || Object.prototype.hasOwnProperty.call(r.json, 'armNonce')
      )) syncArmState(r.json);
      return r;
    }
    surfaceWriteFailure(r, pathAndQuery);
    return null;
  }

  function shortId(value) {
    return value ? String(value).replace(/^tab-/, '').slice(0, 8) : '-';
  }

  function shortHash(value) {
    return value ? ('h' + djb2(String(value)).toString(16)) : null;
  }

  function leaderLeaseMsLeft() {
    const expiresAt = LE.leaderLease && Number(LE.leaderLease.expiresAt || 0);
    return expiresAt ? Math.max(0, expiresAt - Date.now()) : 0;
  }

  function isCurrentLeader() {
    return !!(LE.bound && LE.leaderIsCurrent && LE.leaderLease && LE.leaderLease.clientId === LE.clientId && leaderLeaseMsLeft() > 0);
  }

  // ----------------------------------------------------------------------------
  // conversationId
  // ----------------------------------------------------------------------------
  function readConversationId() {
    const m = location.pathname.match(/\/c\/([0-9a-fA-F-]{36})/) || location.pathname.match(/([0-9a-fA-F]{8}-[0-9a-fA-F-]{27})/);
    return m ? m[1] : null;
  }

  async function ensureRegistered() {
    const id = readConversationId();
    if (!id) {
      if (LE.conversationId || LE.bound) resetTransientForConversation(null);
      return;
    }
    if (id !== LE.conversationId) resetTransientForConversation(id);
    if (id === LE.conversationId && LE.bound && Date.now() - LE.lastLeaderHeartbeatAt < LEADER_HEARTBEAT_MS) return;
    const stored = await loadLocalBinding(id);
    const r = await bridge('/api/register', 'POST', {
      conversationId: id,
      clientId: LE.clientId,
      codexSessionId: stored && stored.codexSessionId,
      workspaceDir: stored && stored.workspaceDir,
    });
    if (r.ok && r.status === 200) {
      LE.bound = true;
      LE.codexSessionId = r.json.codexSessionId;
      LE.workspaceDir = r.json.workspaceDir;
      LE.capsule = r.json.capsule || null;
      LE.briefing = r.json.briefing || null;
      LE.conversationMode = r.json.conversationMode || 'chat';
      syncArmState(r.json);
      LE.bridgeOk = true;
      LE.authRequired = false;
      LE.leaderLease = r.json.leaderLease || null;
      LE.leaderIsCurrent = !!r.json.leader;
      if (!LE.leaderIsCurrent) LE.lastControlError = 'leader_conflict';
      else if (LE.lastControlError === 'leader_conflict') LE.lastControlError = null;
      LE.lastLeaderHeartbeatAt = Date.now();
      log('registered', id, '->', LE.codexSessionId, LE.workspaceDir);
    } else if (r.ok && r.status === 409) {
      LE.bound = false;            // unknown conversation, fill Codex Session ID in the panel
      LE.bridgeOk = true;
      LE.authRequired = false;
    } else if (r.ok && r.status === 401) {
      LE.bound = false;
      LE.bridgeOk = true;
      LE.authRequired = true;
      LE.leaderIsCurrent = false;
    } else {
      LE.bridgeOk = false;         // bridge not up
      LE.leaderIsCurrent = false;
    }
  }

  // Local per-conversation binding (lets different windows of one project map to different sessions)
  function loadLocalBinding(id) {
    return new Promise(res => chrome.storage.local.get(['binding:' + id], o => res(o['binding:' + id] || null)));
  }
  function saveLocalBinding(id, codexSessionId, workspaceDir) {
    return new Promise(res => chrome.storage.local.set({ ['binding:' + id]: { codexSessionId, workspaceDir } }, res));
  }
  function loadApiToken() {
    return new Promise(res => chrome.storage.local.get(['apiToken'], o => res(o.apiToken || '')));
  }
  function saveApiToken(token) {
    return new Promise(res => chrome.storage.local.set({ apiToken: token || '' }, res));
  }
  function loadBridgeUrl() {
    return new Promise(res => chrome.storage.local.get(['bridgeUrl'], o => res(o.bridgeUrl || DEFAULT_BRIDGE_URL)));
  }
  function saveBridgeUrl(url) {
    return new Promise(res => chrome.storage.local.set({ bridgeUrl: url || DEFAULT_BRIDGE_URL }, res));
  }
  function resultStorageKey(resultId) {
    return 'insertedResult:' + (LE.conversationId || 'none') + ':' + resultId;
  }
  function resultDeliveryKey(resultId) {
    return 'resultDelivery:' + (LE.conversationId || 'none') + ':' + resultId;
  }
  function resultIdLine(id) {
    return `[aegisloop_result_id:${id}]`;
  }
  function loadResultDelivery(resultId) {
    if (!resultId) return Promise.resolve({});
    const keys = [resultStorageKey(resultId), resultDeliveryKey(resultId)];
    return new Promise(res => chrome.storage.local.get(keys, o => {
      const ledger = o[resultDeliveryKey(resultId)] || {};
      if (o[resultStorageKey(resultId)] && !ledger.dom_confirmed) ledger.dom_confirmed = true;
      res(ledger);
    }));
  }
  async function patchResultDelivery(resultId, patch) {
    if (!resultId) return {};
    const existing = await loadResultDelivery(resultId);
    const next = { ...existing, ...patch, updatedAt: Date.now() };
    return new Promise(res => chrome.storage.local.set({ [resultDeliveryKey(resultId)]: next }, () => res(next)));
  }
  async function wasResultInserted(resultId) {
    const ledger = await loadResultDelivery(resultId);
    return !!(ledger.dom_confirmed || ledger.ack_sent);
  }
  async function markResultInserted(resultId, patch) {
    if (!resultId) return Promise.resolve();
    await patchResultDelivery(resultId, { ...(patch || {}), dom_confirmed: true, domConfirmedAt: Date.now() });
    return new Promise(res => chrome.storage.local.set({ [resultStorageKey(resultId)]: Date.now() }, res));
  }
  function markResultAckSent(resultId) {
    if (!resultId) return Promise.resolve();
    return patchResultDelivery(resultId, { ack_sent: true, ackSentAt: Date.now() });
  }
  function recentUserContains(text, limit) {
    if (!text) return false;
    const users = SEL.messages().filter(m => m.role === 'user').slice(-(limit || 8));
    return users.some(m => String(m.text || '').includes(text));
  }
  function recentUserHasResult(resultId) {
    return recentUserContains(resultIdLine(resultId), 8);
  }
  async function shouldHoldUnconfirmedDelivery(resultId) {
    const ledger = await loadResultDelivery(resultId);
    if (!ledger.delivery_attempted || ledger.dom_confirmed || ledger.ack_sent) return false;
    return Date.now() - Number(ledger.attemptedAt || 0) < RESULT_DELIVERY_HOLD_MS;
  }
  function normalizeBridgeUrlForPanel(value) {
    const raw = String(value || DEFAULT_BRIDGE_URL).trim();
    let url;
    try {
      url = new URL(raw);
    } catch (e) {
      throw new Error('Bridge URL must look like http://127.0.0.1:17380');
    }
    if (url.protocol !== 'http:') {
      throw new Error('Bridge URL must use http, not https.');
    }
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      throw new Error('Bridge URL must point to 127.0.0.1 or localhost.');
    }
    if (!url.port) {
      throw new Error('Bridge URL must include the local bridge port, for example http://127.0.0.1:17380');
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Bridge URL should be only the origin, for example http://127.0.0.1:17380');
    }
    return url.origin;
  }

  async function copyText(text) {
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ----------------------------------------------------------------------------
  // Streaming-done detection + latest assistant message
  // ----------------------------------------------------------------------------
  function latestAssistant() {
    const msgs = SEL.messages();
    let last = null, count = 0;
    for (const m of msgs) if (m.role === 'assistant') { last = m; count++; }
    return last ? Object.assign({}, last, { count }) : null;
  }
  function latestUser() {
    const msgs = SEL.messages();
    let last = null, count = 0;
    for (const m of msgs) if (m.role === 'user') { last = m; count++; }
    return last ? Object.assign({}, last, { count }) : null;
  }
  function isStreaming() { return !!SEL.stopButton(); }

  function sigOf(a) {
    if (!a) return null;
    const blocks = Array.isArray(a.codeBlocks) ? a.codeBlocks.join('\0') : '';
    const full = `${a.role || 'assistant'}\0${a.text || ''}\0${blocks}`;
    return `${a.count}|${full.length}|${djb2(full)}`;
  }
  function codeBlockHashOf(a) {
    if (!a) return null;
    const blocks = Array.isArray(a.codeBlocks) ? a.codeBlocks.join('\0') : '';
    const full = `${a.text || ''}\0${blocks}`;
    return String(djb2(full));
  }
  function djb2(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }

  function selectorHealth() {
    const msgs = SEL.messages();
    const assistant = latestAssistant();
    const user = latestUser();
    return {
      composer: !!SEL.composer(),
      send: !!SEL.sendButton(),
      stop: !!SEL.stopButton(),
      assistants: msgs.filter(m => m.role === 'assistant').length,
      users: msgs.filter(m => m.role === 'user').length,
      latestAssistantSig: sigOf(assistant) || '-',
      latestUserSig: sigOf(user) || '-',
    };
  }

  function debugSnapshot() {
    const bridgeOrigin = (() => {
      try { return new URL(LE.bridgeUrl || DEFAULT_BRIDGE_URL).origin; }
      catch (e) { return 'invalid_bridge_url'; }
    })();
    const assistant = latestAssistant();
    const user = latestUser();
    const h = selectorHealth();
    const leaseLeft = leaderLeaseMsLeft();
    return {
      contentVersion: CONTENT_VERSION,
      contractVersion: CONTRACT_VERSION,
      bridgeOrigin,
      conversationIdHash: shortHash(LE.conversationId),
      clientId: shortId(LE.clientId),
      leader: {
        isCurrent: isCurrentLeader(),
        clientId: shortId(LE.leaderLease && LE.leaderLease.clientId),
        expiresInMs: leaseLeft,
      },
      mode: LE.conversationMode,
      local: LE.local,
      loopState: LE.loopState,
      lastError: LE.lastControlError || LE.bridgeError || LE.pauseReason || null,
      selectorHealth: h,
      latestAssistantSignature: sigOf(assistant),
      latestUserSignature: sigOf(user),
      pendingResultIdHash: shortHash(LE.resultDeliveryUnconfirmed),
      armIdHash: shortHash(LE.armId),
      turnNonceHash: shortHash(LE.turnNonce || LE.armNonce),
      armNonceHash: shortHash(LE.armNonce),
      lastSubmitMsgId: LE.lastSubmitMsgId ? shortId(LE.lastSubmitMsgId) : null,
      seedSubmitUnconfirmed: !!LE.seedSubmitUnconfirmed,
      resultDeliveryUnconfirmed: !!LE.resultDeliveryUnconfirmed,
      generatedAt: new Date().toISOString(),
    };
  }

  // Collect text of <pre>/<code> blocks rendered in a message (ChatGPT renders
  // ```codex as <pre><code> and innerText then loses the ``` fences).
  function codeBlocksFromNode(node) {
    const blocks = [];
    const seen = new Set();
    for (const el of Array.from(node.querySelectorAll('pre, code'))) {
      const holder = el.tagName === 'CODE' && el.closest('pre') ? el.closest('pre') : el;
      if (seen.has(holder)) continue;
      seen.add(holder);
      const code = holder.tagName === 'PRE' ? (holder.querySelector('code') || holder) : holder;
      const text = (code.innerText || code.textContent || '').trim();
      if (text) blocks.push(text);
    }
    return blocks;
  }

  function parsePromptPayload(inner) {
    let prompt = String(inner || '').trim();
    let armId = null;
    let turnNonce = null;
    let armNonce = null;
    if (!prompt) return null;
    try {
      const j = JSON.parse(prompt);
      if (j && typeof j.prompt === 'string') {
        prompt = j.prompt;
        armId = j.arm_id || j.armId || null;
        turnNonce = j.turn_nonce || j.turnNonce || j.arm_nonce || j.armNonce || null;
        armNonce = j.arm_nonce || j.armNonce || null;
      }
    } catch (e) { /* treat as plain-text prompt */ }
    prompt = String(prompt).trim();
    return prompt ? { prompt, armId, turnNonce, armNonce } : null;
  }

  // ----------------------------------------------------------------------------
  // codex block / stop sentinel extraction
  // ----------------------------------------------------------------------------
  function extractCodex(message) {
    const text = typeof message === 'string' ? message : (message && message.text) || '';

    // 1) fenced ```codex block in the message text
    const all = [...String(text).matchAll(/```codex\s*([\s\S]*?)```/gi)];
    if (all.length) {
      const parsed = parsePromptPayload(all[all.length - 1][1].trim());
      if (parsed) return parsed;
    }

    // 2) ChatGPT may render the codex block as <pre><code> (no visible fences);
    //    accept a code block whose body is JSON {"prompt": "..."}.
    const blocks = Array.isArray(message && message.codeBlocks) ? message.codeBlocks : [];
    for (let i = blocks.length - 1; i >= 0; i--) {
      const raw = String(blocks[i] || '').trim();
      if (!/^\{[\s\S]*\}$/.test(raw)) continue;
      const parsed = parsePromptPayload(raw);
      if (parsed) return parsed;
    }

    // LOOP_STOP only counts when it is the whole assistant reply. The contract
    // itself contains this sentinel as an example, so substring matching would
    // falsely pause while a valid codex block is present lower in the message.
    if (/^<<<\s*LOOP_STOP\s*>>>$/i.test(String(text).trim())) return { stop: true };
    return null;
  }

  function currentReadyCodex() {
    if (isStreaming()) return null;
    const a = latestAssistant();
    const parsed = a ? extractCodex(a) : null;
    return parsed && parsed.prompt && canDispatchParsed(parsed) ? { assistant: a, parsed } : null;
  }

  function currentFreshReadyCodex() {
    const ready = currentReadyCodex();
    if (!ready) return null;
    const sig = sigOf(ready.assistant);
    return sig && sig !== LE.lastSig ? ready : null;
  }

  async function waitForFreshReadyCodex(timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (LE.userHold || !activeMode()) return null;
      const ready = currentFreshReadyCodex();
      if (ready) return ready;
      await sleep(500);
    }
    return null;
  }

  function canDispatchParsed(parsed) {
    if (!parsed || !parsed.prompt) return false;
    if (!['armed', 'review'].includes(LE.conversationMode)) return false;
    const currentTurnNonce = LE.turnNonce || LE.armNonce;
    return !!LE.armId && !!currentTurnNonce
      && parsed.armId === LE.armId
      && parsed.turnNonce === currentTurnNonce;
  }

  // ----------------------------------------------------------------------------
  // Composer write  (key: let React/ProseMirror SEE the change)
  // IMPORTANT: never do innerHTML='' on a ProseMirror editor - it destroys the
  // editor's own DOM and desyncs its internal state, which makes inserts/sends
  // silently fail. We replace content via selectAll + insertText instead.
  // ----------------------------------------------------------------------------
  function setComposerText(text) {
    const el = SEL.composer();
    if (!el) { log('composer NOT found'); return false; }
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    try {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('selectAll', false, null);
      const ok = document.execCommand('insertText', false, text);
      if (!ok) throw new Error('execCommand insertText returned false');
    } catch (e) {
      // fallback: dispatch real input events (still NOT touching innerHTML)
      try { el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text })); } catch (e2) {}
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    }
    return true;
  }

  // ProseMirror-safe clear (selectAll + delete). Best-effort, never throws.
  function clearComposer() {
    const el = SEL.composer();
    if (!el) return;
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges(); sel.addRange(range);
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
    } catch (e) { /* ignore */ }
  }

  function composerText() {
    const el = SEL.composer();
    if (!el) return '';
    return (el.tagName === 'TEXTAREA' ? el.value : el.innerText || el.textContent || '').trim();
  }

  function clickSend() {
    const btn = SEL.sendButton();
    if (btn) {
      if (btn.disabled) return false;
      btn.click();
      return true;
    }
    const el = SEL.composer();
    if (el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return true;
    }
    return false;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const msgIdLine = (id) => `[aegisloop_msg_id:${id}]`;

  // Send to GPT and CONFIRM by reading back a new matching user message.
  // We do NOT gate on "composer is empty" - ChatGPT clears its own composer on
  // a successful send; if a cosmetic draft remains we tidy it but never fail on it.
  async function submitToGPTDetailed(text, options) {
    const resultId = options && options.resultId;
    const msgId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
    LE.lastSubmitMsgId = msgId;
    const marker = msgIdLine(msgId);
    const resultMarker = resultId ? resultIdLine(resultId) : null;
    const markerLines = resultMarker ? `${marker}\n${resultMarker}` : marker;
    const outgoing = `${text}\n\n${markerLines}`;
    const conversationId = LE.conversationId;
    const current = () => conversationId === LE.conversationId && conversationId === readConversationId() && !LE.userHold && activeMode();
    const failed = (reason, attempted = false) => {
      if (reason && current()) LE.lastControlError = reason;
      return { ok: false, attempted, msgId, marker, resultMarker };
    };
    if (!current()) return failed(null);
    if (composerText()) return failed('composer_has_draft');
    if (!setComposerText(outgoing)) return failed('composer_missing');
    await sleep(150);
    if (!current()) return failed(null);
    if (composerText() !== outgoing.trim()) return failed('composer_changed');
    if (!clickSend()) return failed('send_not_ready');
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      await sleep(500);
      if (!current()) return failed(null, true);
      if (recentUserContains(marker) || (resultMarker && recentUserContains(resultMarker))) {
        // Never clear a new manual draft entered while send confirmation was pending.
        if (composerText() === outgoing.trim()) clearComposer();
        log('submit confirmed (aegisloop_msg_id seen)');
        return { ok: true, attempted: true, msgId, marker, resultMarker };
      }
    }
    // An absent bubble is not proof that sending failed. Do not blindly send again.
    return failed('submit_unconfirmed', true);
  }

  async function submitToGPT(text) {
    const result = await submitToGPTDetailed(text);
    return !!result.ok;
  }

  // ----------------------------------------------------------------------------
  // Main loop tick
  // ----------------------------------------------------------------------------
  let tickTimer = null;

  function activeMode() {
    return LE.conversationMode === 'armed' || LE.conversationMode === 'review' || LE.conversationMode === 'running';
  }

  function desiredPollDelay() {
    if (!LE.conversationId || !LE.bound || !LE.bridgeOk || LE.authRequired) return IDLE_POLL_MS;
    if (LE.local === 'dispatching' || LE.local === 'inserting' || LE.local === 'awaiting_assistant') return FAST_POLL_MS;
    if (activeMode()) return FAST_POLL_MS;
    return IDLE_POLL_MS;
  }

  function scheduleTick(delay) {
    if (tickTimer) clearTimeout(tickTimer);
    tickTimer = setTimeout(tick, delay);
  }

  function nudgeTick() {
    if (!LE.ticking && activeMode()) scheduleTick(DOM_NUDGE_MS);
  }

  async function tick() {
    if (LE.ticking) return;
    LE.ticking = true;
    try {
      await ensureRegistered();
      renderPanel();
      if (!LE.conversationId || !LE.bound || !LE.bridgeOk) return;

      // On first run, always baseline the latest assistant signature. Old
      // codex blocks must never resurrect just because the extension loaded.
      if (!LE.initializedLatestSig) {
        const existing = latestAssistant();
        LE.lastSig = existing ? sigOf(existing) : null;
        LE.initializedLatestSig = true;
        log('baseline assistant signature initialized', LE.lastSig);
      }

      // Pull authoritative state from the bridge.
      const cs = await bridge('/api/conversations', 'GET');
      if (cs.ok && cs.status === 401) { LE.authRequired = true; LE.bridgeOk = true; return; }
      if (!(cs.ok && cs.status === 200)) { LE.bridgeOk = false; return; }
      LE.authRequired = false;
      const me = (cs.json.conversations || []).find(c => c.conversationId === LE.conversationId);
      if (!me) { LE.bound = false; return; }
      LE.codexSessionId = me.codexSessionId || LE.codexSessionId;
      LE.workspaceDir = me.workspaceDir || LE.workspaceDir;
      LE.fullAuto = me.fullAuto !== false;
      LE.loopState = me.loopState;
      LE.pauseReason = me.pauseReason;
      LE.blockedPayload = me.blockedPayload || null;
      LE.capsule = me.capsule || null;
      LE.briefing = me.briefing || null;
      LE.conversationMode = me.conversationMode || 'chat';
      syncArmState(me);
      LE.leaderLease = me.leaderLease || LE.leaderLease;
      LE.leaderIsCurrent = !!(LE.leaderLease && LE.leaderLease.clientId === LE.clientId);

      if (LE.conversationMode === 'chat' || LE.conversationMode === 'frozen') {
        LE.local = 'idle';
        LE.seedSubmitUnconfirmed = false;
        return;
      }

      if (LE.loopState === 'running' && me.hasPendingResult && LE.local !== 'dispatching' && LE.local !== 'inserting') {
        log('bridge has a pending result; polling it now');
        LE.local = 'dispatching';
      }

      if (LE.loopState !== 'running') {
        return;
      }

      // Waiting for a Codex result.
      if (LE.local === 'dispatching') {
        const rr = await bridge('/api/result?conversationId=' + encodeURIComponent(LE.conversationId)
          + '&clientId=' + encodeURIComponent(LE.clientId), 'GET');
        if (rr.ok && rr.json.hasResult) {
          const result = rr.json.result;
          const resultId = result.resultId || null;
          log('got codex result, inserting to GPT', result.jobId, 'ok=', result.ok);
          if (resultId && (await wasResultInserted(resultId) || recentUserHasResult(resultId))) {
            await markResultInserted(resultId, { recoveredFromDom: recentUserHasResult(resultId) });
            const ack = await postControl('/api/result/ack', {
              conversationId: LE.conversationId,
              jobId: result.jobId,
              resultId,
            });
            if (ack) {
              syncArmState(ack.json);
              LE.conversationMode = ack.json.conversationMode || LE.conversationMode;
              LE.loopState = ack.json.loopState || LE.loopState;
              LE.pauseReason = ack.json.pauseReason || null;
              await markResultAckSent(resultId);
              LE.local = 'awaiting_assistant';
              LE.resultDeliveryUnconfirmed = null;
              resetProtocolRecovery();
            }
            return;
          }
          if (resultId && await shouldHoldUnconfirmedDelivery(resultId)) {
            LE.local = 'idle';
            LE.resultDeliveryUnconfirmed = resultId;
            await postControl('/api/result/nack', {
              conversationId: LE.conversationId,
              jobId: result.jobId,
              resultId,
              reason: 'result_delivery_unconfirmed',
            });
            return;
          }
          LE.local = 'inserting';
          const payload = result.finalMessage + '\n' + contractText();
          if (resultId) {
            await patchResultDelivery(resultId, {
              delivery_attempted: true,
              attemptedAt: Date.now(),
              jobId: result.jobId,
            });
          }
          const sent = await submitToGPTDetailed(payload, { resultId });
          if (sent.ok || (resultId && recentUserHasResult(resultId))) {
            if (resultId) await markResultInserted(resultId, {
              msgId: sent.msgId,
              recoveredFromDom: !sent.ok,
            });
            const ack = await postControl('/api/result/ack', {
              conversationId: LE.conversationId,
              jobId: result.jobId,
              resultId,
            });
            if (ack) {
              syncArmState(ack.json);
              LE.conversationMode = ack.json.conversationMode || LE.conversationMode;
              LE.loopState = ack.json.loopState || LE.loopState;
              LE.pauseReason = ack.json.pauseReason || null;
              if (resultId) await markResultAckSent(resultId);
              LE.local = 'awaiting_assistant';
              LE.resultDeliveryUnconfirmed = null;
              resetProtocolRecovery();
            }
          }
          else {
            LE.local = 'idle';
            LE.resultDeliveryUnconfirmed = resultId;
            if (resultId) {
              await patchResultDelivery(resultId, {
                delivery_attempted: true,
                msgId: sent.msgId,
                marker: sent.marker,
                resultMarker: sent.resultMarker,
                unconfirmedAt: Date.now(),
              });
            }
            await postControl('/api/result/nack', {
              conversationId: LE.conversationId,
              jobId: result.jobId,
              resultId,
              reason: sent.attempted ? 'result_delivery_unconfirmed' : 'result_insert_failed',
            });
            log('insert unconfirmed -> paused for human');
          }
        }
        return;
      }

      if (LE.local === 'inserting') return;
      if (LE.conversationMode === 'running') return;

      // awaiting_assistant / idle: look at GPT's latest reply.
      const a = latestAssistant();
      if (!a) return;
      LE.prevAssistantText = a.text;
      if (isStreaming()) { log('assistant streaming...'); return; }

      const sig = sigOf(a);
      if (sig === LE.lastSig) return;   // already handled, nothing new

      const parsed = extractCodex(a);

      if (parsed && parsed.stop) {
        const mode = await postControl('/api/mode', { conversationId: LE.conversationId, action: 'chat', reason: 'loop_stop_requested' });
        if (mode) {
          LE.lastSig = sig;
          LE.seedSubmitUnconfirmed = false;
          resetProtocolRecovery();
          log('GPT requested LOOP_STOP -> chat mode');
        }
        return;
      }

      if (parsed && parsed.prompt && canDispatchParsed(parsed)) {
        const d = await bridge('/api/dispatch', 'POST', {
          conversationId: LE.conversationId,
          clientId: LE.clientId,
          prompt: parsed.prompt,
          armId: parsed.armId,
          turnNonce: parsed.turnNonce,
          assistantMessageSig: sig,
          codeBlockHash: codeBlockHashOf(a),
        });
        if (!(d.ok && d.status === 200)) {
          surfaceWriteFailure(d, 'dispatch_failed');
          return;
        }
        LE.lastSig = sig;
        LE.seedSubmitUnconfirmed = false;
        resetProtocolRecovery();
        if (d.ok && d.json.status === 'accepted') {
          syncArmState(d.json);
          LE.local = 'dispatching';
          log('dispatched to codex, waiting result');
        } else if (d.ok && d.json.status === 'busy') {
          LE.local = 'dispatching';
          log('conversation already has an active dispatch, waiting result');
        } else if (d.ok && d.json.status === 'duplicate') {
          const mode = await postControl('/api/mode', { conversationId: LE.conversationId, action: 'chat', reason: 'duplicate_payload' });
          if (mode) {
            LE.local = 'idle';
            log('duplicate payload -> paused for human');
          }
        } else if (d.ok && (d.json.status === 'blocked' || d.json.status === 'not_running')) {
          LE.lastControlError = d.json.rule || d.json.status || 'dispatch_blocked';
          if (TURN_TOKEN_ERRORS.has(LE.lastControlError)) LE.seedSubmitUnconfirmed = false;
          log('dispatch blocked/not_running:', d.json);
        } else if (d.ok && d.json.status === 'pending_result_exists') {
          LE.local = 'dispatching';
          log('dispatch refused because a pending result exists; polling result');
        } else {
          surfaceWriteFailure(d, d.json && d.json.status || 'dispatch_failed');
        }
        return;
      }

      // No executable codex block. Give slow reasoning replies a grace window
      // before nudging them back onto the protocol. If the bounded budget is
      // spent, pause as a protocol issue instead of silently turning this into
      // an ordinary Chat Mode thread.
      if (LE.missingCodexSig !== sig) {
        LE.missingCodexSig = sig;
        LE.missingCodexFirstSeenAt = Date.now();
        LE.missingCodexStableSince = Date.now();
        LE.local = 'awaiting_assistant';
        log('no codex block yet -> waiting for assistant text to stabilize');
        return;
      }
      if (isStreaming()) {
        LE.missingCodexStableSince = Date.now();
        LE.local = 'awaiting_assistant';
        log('assistant still streaming -> no protocol nudge');
        return;
      }
      const stableForMs = Date.now() - (LE.missingCodexStableSince || LE.missingCodexFirstSeenAt || Date.now());
      const waitMs = looksLikeToolUnavailable(a.text) ? TOOL_UNAVAILABLE_REPAIR_MS : Math.max(ASSISTANT_STABLE_BEFORE_REPAIR_MS, NO_CODEX_GRACE_MS);
      if (stableForMs < waitMs) {
        LE.local = 'awaiting_assistant';
        return;
      }
      if (!LE.userHold && LE.reformatCount < MAX_REFORMAT) {
        LE.reformatCount++;
        log('no codex block -> reformat nudge', LE.reformatCount, '/', MAX_REFORMAT);
        const sent = await submitToGPT(reformatMsg());
        LE.lastSig = sig;
        if (sent) { LE.local = 'awaiting_assistant'; }
        else {
          LE.needsProtocolFix = true;
          const paused = await postControl('/api/control', { conversationId: LE.conversationId, action: 'pause', reason: 'reformat_submit_failed' });
          if (paused) LE.local = 'idle';
        }
      } else {
        LE.lastSig = sig;
        LE.needsProtocolFix = true;
        const paused = await postControl('/api/control', { conversationId: LE.conversationId, action: 'pause', reason: 'needs_user_protocol_fix' });
        if (paused) {
          LE.local = 'idle';
          log('no codex block and reformat budget spent -> protocol fix needed');
        }
      }
      return;
    } catch (e) {
      log('tick error', e);
    } finally {
      LE.ticking = false;
      renderPanel();
      scheduleTick(desiredPollDelay());
    }
  }

  // ----------------------------------------------------------------------------
  // Panel UI
  // ----------------------------------------------------------------------------
  let panel;
  const panelView = { collapsed: false, x: null, y: null };
  function placePanel() {
    const viewport = window.visualViewport;
    const left = (viewport ? viewport.offsetLeft : 0) + 8;
    const top = (viewport ? viewport.offsetTop : 0) + 8;
    const width = viewport ? viewport.width : innerWidth;
    const height = viewport ? viewport.height : innerHeight;
    panel.style.maxWidth = Math.max(0, width - 16) + 'px';
    panel.style.maxHeight = Math.max(0, height - 16) + 'px';
    const rect = panel.getBoundingClientRect();
    const x = Number.isFinite(panelView.x) ? panelView.x : left + width - rect.width - 24;
    const y = Number.isFinite(panelView.y) ? panelView.y : top + 64;
    panel.style.left = Math.max(left, Math.min(x, left + width - rect.width - 16)) + 'px';
    panel.style.top = Math.max(top, Math.min(y, top + height - rect.height - 16)) + 'px';
  }
  function savePanelView() {
    chrome.storage.local.set({ panelView: { ...panelView } }, () => {
      if (chrome.runtime.lastError) log('panel preferences could not be saved');
    });
  }
  function setPanelCollapsed(collapsed) {
    panelView.collapsed = collapsed;
    panel.classList.toggle('le-collapsed', collapsed);
    const button = panel.querySelector('#le-collapse');
    button.innerHTML = collapsed ? '&#43;' : '&minus;';
    button.title = collapsed ? 'Expand panel' : 'Minimize panel (automation continues)';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!collapsed));
    placePanel();
  }
  function bindPanelView() {
    let edited = false;
    let drag = null;
    const handle = panel.querySelector('#le-move');
    const rememberPosition = () => {
      const rect = panel.getBoundingClientRect();
      panelView.x = rect.left;
      panelView.y = rect.top;
      savePanelView();
    };
    handle.onpointerdown = event => {
      if (event.button !== 0) return;
      edited = true;
      const rect = panel.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - rect.left, y: event.clientY - rect.top };
      handle.setPointerCapture(event.pointerId);
    };
    handle.onpointermove = event => {
      if (!drag || drag.id !== event.pointerId) return;
      panelView.x = event.clientX - drag.x;
      panelView.y = event.clientY - drag.y;
      placePanel();
    };
    const finishDrag = () => { if (drag) { drag = null; rememberPosition(); } };
    handle.onpointerup = finishDrag;
    handle.onpointercancel = finishDrag;
    handle.onlostpointercapture = finishDrag;
    handle.onkeydown = event => {
      const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (!moves[event.key]) return;
      event.preventDefault();
      edited = true;
      const rect = panel.getBoundingClientRect();
      const step = event.shiftKey ? 40 : 10;
      panelView.x = rect.left + moves[event.key][0] * step;
      panelView.y = rect.top + moves[event.key][1] * step;
      placePanel();
      rememberPosition();
    };
    panel.querySelector('#le-collapse').onclick = () => {
      edited = true;
      setPanelCollapsed(!panelView.collapsed);
      savePanelView();
    };
    panel.querySelector('#le-position-reset').onclick = () => {
      edited = true;
      panelView.x = panelView.y = null;
      placePanel();
      savePanelView();
    };
    chrome.storage.local.get(['panelView'], data => {
      if (chrome.runtime.lastError || edited) return;
      const saved = data.panelView || {};
      panelView.x = Number.isFinite(saved.x) ? saved.x : null;
      panelView.y = Number.isFinite(saved.y) ? saved.y : null;
      setPanelCollapsed(saved.collapsed === true);
    });
    window.addEventListener('resize', placePanel);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', placePanel);
      window.visualViewport.addEventListener('scroll', placePanel);
    }
    new ResizeObserver(placePanel).observe(panel);
    placePanel();
  }
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'le-panel';
    panel.innerHTML = `
      <style>
        #le-panel{position:fixed;z-index:2147483647;width:320px;max-height:calc(100dvh - 16px);display:flex;flex-direction:column;font:12px/1.5 system-ui,sans-serif;letter-spacing:0;color:#e6e6e6;background:#15171c;border:1px solid #2a2e37;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.3);overflow:hidden;color-scheme:dark;text-align:left}
        #le-panel,#le-panel *{box-sizing:border-box}
        #le-panel [hidden]{display:none!important}
        #le-panel header{display:flex;align-items:center;gap:4px;padding:4px 6px;background:#1b1e25;border-bottom:1px solid #2a2e37;flex-shrink:0}
        #le-panel header b{font-size:12px;letter-spacing:0}
        #le-panel #le-move{flex:1;min-width:0;text-align:left;cursor:move;touch-action:none;user-select:none;background:transparent;border-color:transparent}
        #le-panel .icon{width:30px;height:30px;padding:0;flex-shrink:0;font-size:18px}
        #le-panel .body{padding:10px;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:auto;overscroll-behavior:contain}
        #le-panel .row{display:flex;gap:6px;align-items:center;justify-content:space-between;min-width:0}
        #le-panel .row>*{min-width:0;overflow-wrap:anywhere}
        #le-panel .row .k{flex-shrink:0}
        #le-panel .k{color:#8a93a3}
        #le-panel .pill{padding:1px 7px;border-radius:999px;font-size:11px}
        #le-panel input{width:100%;background:#0f1115;border:1px solid #2a2e37;color:#e6e6e6;border-radius:6px;padding:5px 7px}
        #le-panel textarea{width:100%;min-height:54px;height:54px;max-height:180px;background:#0f1115;border:1px solid #2a2e37;color:#e6e6e6;border-radius:6px;padding:6px 7px;resize:vertical}
        #le-panel button{cursor:pointer;border:1px solid #2a2e37;background:#222632;color:#e6e6e6;border-radius:6px;padding:5px 8px;font:inherit;min-height:30px;overflow-wrap:anywhere}
        #le-panel button:focus-visible,#le-panel summary:focus-visible{outline:2px solid #9fd2ff;outline-offset:-2px}
        #le-panel button:hover{background:#2a2f3d}
        #le-panel button:disabled{opacity:.45;cursor:not-allowed}
        #le-panel button:disabled:hover{background:#222632}
        #le-panel button.danger{background:#3a1c1f;border-color:#5a2a2e;color:#ffb4b4}
        #le-panel button.go{background:#16331f;border-color:#2a5a36;color:#b6ffc8}
        #le-panel .muted{color:#8a93a3;font-size:11px}
        #le-panel .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}
        #le-panel .capsule{border-top:1px solid #2a2e37;padding:7px 0}
        #le-panel details{border-top:1px solid #2a2e37;padding-top:6px}
        #le-panel summary{cursor:pointer;padding:4px 0;font-weight:600}
        #le-panel .section-content{display:flex;flex-direction:column;gap:8px;padding-top:6px}
        #le-panel footer{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-top:1px solid #2a2e37;flex-shrink:0;background:#1b1e25;max-height:calc(100dvh - 60px);overflow:auto}
        #le-panel .compact{display:none;padding:6px 8px;gap:8px;align-items:center;justify-content:space-between}
        #le-panel.le-collapsed{width:260px}
        #le-panel.le-collapsed .body,#le-panel.le-collapsed footer{display:none}
        #le-panel.le-collapsed .compact{display:flex}
        #le-panel #le-compact-state{min-width:0;overflow-wrap:anywhere}
        #le-panel .le-ok{background:#16331f;color:#b6ffc8}#le-panel .le-warn{background:#3a2f12;color:#ffe39a}#le-panel .le-bad{background:#3a1c1f;color:#ffb4b4}#le-panel .le-run{background:#13283a;color:#9fd2ff}
      </style>
      <header>
        <button id="le-move" title="Move panel: drag or use arrow keys" aria-label="Move AegisLoop panel"><b>AegisLoop <span class="muted" id="le-ver">v${CONTENT_VERSION}</span></b></button>
        <button id="le-position-reset" class="icon" title="Reset panel position" aria-label="Reset panel position">&#8634;</button>
        <button id="le-collapse" class="icon" title="Minimize panel (automation continues)" aria-label="Minimize panel (automation continues)" aria-expanded="true" aria-controls="le-panel-body le-panel-controls">&minus;</button>
      </header>
      <div class="compact"><span id="le-compact-state" class="pill le-warn">Checking</span><button id="le-compact-pause" class="icon" title="Pause automation (current Codex task may finish)" aria-label="Pause automation">&#9208;</button></div>
      <div class="body" id="le-panel-body">
        <div class="row"><span class="k">Local bridge</span><span id="le-bridge" class="pill le-bad">not running</span></div>
        <div class="row"><span class="k">Mode</span><span id="le-state" class="pill le-run">-</span></div>
        <div id="le-simple" class="pill le-run">checking...</div>
        <div id="le-reason" class="muted" role="status"></div>
        <div id="le-blocked" style="display:none">
          <div class="pill le-warn">Needs approval</div>
          <div id="le-blocked-rule" class="muted"></div>
          <div class="grid" style="margin-top:6px"><button id="le-approve" class="go">Allow once</button><button id="le-skip">Skip</button></div>
        </div>
        <label id="le-seed-label" class="muted" for="le-seed">First instruction (optional)</label>
        <textarea id="le-seed" placeholder="Next local Codex task"></textarea>
        <button id="le-seed-starter">Use starter text</button>
        <details id="le-connection"><summary>Connection</summary><div class="section-content">
        <div class="grid"><input id="le-bridge-url" aria-label="Bridge URL" placeholder="http://127.0.0.1:17380" /><button id="le-bridge-save">Save URL</button></div>
        <div id="le-tokenbox" style="display:none">
          <div class="pill le-warn">Bridge token required</div>
          <input id="le-token" type="password" placeholder="X-AegisLoop-Token" style="margin-top:6px" />
          <button id="le-token-save" class="go" style="width:100%;margin-top:6px">Save token</button>
        </div>
        <div class="row"><span class="k">ChatGPT tab</span><span id="le-conv" class="muted">-</span></div>
        <div class="row"><span class="k">Local Codex session</span><span id="le-sess" class="muted">-</span></div>
        <div class="row"><span class="k">Execution route</span><span class="pill le-ok">AegisLoop local bridge</span></div>
        <div class="row"><span class="k">Tab leader</span><span id="le-leader" class="pill le-warn">checking</span></div>
        <div class="row"><span class="k">Client / lease</span><span id="le-client" class="muted">-</span></div>
        <div id="le-bindbox" style="display:none">
          <div class="muted">Connect this ChatGPT tab to a local Codex session.</div>
          <input id="le-sessin" aria-label="Local Codex session id" placeholder="Local Codex session id (019f...)" />
          <input id="le-wsin" aria-label="Workspace folder" placeholder="Workspace folder" />
          <button id="le-bind" class="go" style="width:100%;margin-top:6px">Connect this chat</button>
        </div>
        </div></details>
        <details><summary>Briefing</summary><div class="section-content">
        <div id="le-capsule" class="capsule">
          <div class="row"><span class="k">Capsule</span><span id="le-capsule-state" class="pill le-warn">legacy</span></div>
          <div class="row"><span class="k">Project</span><span id="le-cap-project" class="muted">-</span></div>
          <div class="row"><span class="k">Branch</span><span id="le-cap-branch" class="muted">-</span></div>
          <div class="row"><span class="k">Mode</span><span id="le-cap-mode" class="muted">-</span></div>
          <div class="row"><span class="k">Run</span><span id="le-cap-run" class="muted">-</span></div>
          <div class="row"><span class="k">Write root</span><span id="le-cap-root" class="muted">-</span></div>
        </div>
        <div id="le-briefing" class="capsule">
          <div class="row"><span class="k">Briefing</span><span id="le-brief-state" class="pill le-warn">missing</span></div>
          <div class="row"><span class="k">Inbox</span><span id="le-brief-inbox" class="muted">-</span></div>
          <textarea id="le-brief-objective" placeholder="Objective for GPT/Codex briefing"></textarea>
          <div class="grid"><button id="le-brief-generate" class="go">Generate briefing</button><button id="le-brief-copy">Copy GPT brief</button></div>
        </div>
        </div></details>
        <details><summary>Diagnostics</summary><div class="section-content">
        <div id="le-selector-health" class="capsule">
          <div class="row"><span class="k">Selector health</span><span id="le-sel-state" class="pill le-warn">checking</span></div>
          <div class="row"><span class="k">Composer / Send / Stop</span><span id="le-sel-controls" class="muted">-</span></div>
          <div class="row"><span class="k">Assistant / User</span><span id="le-sel-counts" class="muted">-</span></div>
          <div class="row"><span class="k">Latest sigs</span><span id="le-sel-sigs" class="muted">-</span></div>
        </div>
        <button id="le-debug-snapshot">Export Debug Snapshot</button>
        <button id="le-dbg" aria-pressed="false" title="Debug log">Debug log</button>
        </div></details>
      </div>
      <footer id="le-panel-controls">
        <div class="grid"><button id="le-chat">Chat mode</button><button id="le-send" class="go">Arm one run</button></div>
        <div class="grid"><button id="le-arm-loop" class="go">Arm loop</button><button id="le-freeze">Freeze</button></div>
        <button id="le-stop" class="danger" style="width:100%">Stop</button>
        <div id="le-confirm" style="display:none"><div class="pill le-bad">Confirm stop?</div><div class="grid" style="margin-top:6px"><button id="le-stop-yes" class="danger">Confirm</button><button id="le-stop-no">Cancel</button></div></div>
      </footer>`;
    document.body.appendChild(panel);
    bindPanelView();

    panel.querySelector('#le-dbg').onclick = () => { LE.debug = !LE.debug; panel.querySelector('#le-dbg').setAttribute('aria-pressed', String(LE.debug)); panel.querySelector('#le-dbg').style.color = LE.debug ? '#b6ffc8' : ''; };
    panel.querySelector('#le-bridge-save').onclick = async () => {
      let url;
      try {
        url = normalizeBridgeUrlForPanel(panel.querySelector('#le-bridge-url').value);
      } catch (e) {
        LE.bridgeError = e.message || String(e);
        renderPanel();
        return alert(LE.bridgeError);
      }
      await saveBridgeUrl(url);
      LE.bridgeUrl = url;
      LE.bridgeError = null;
      LE.bound = false;
      await ensureRegistered();
      renderPanel();
    };
    panel.querySelector('#le-token-save').onclick = async () => {
      const token = panel.querySelector('#le-token').value.trim();
      await saveApiToken(token);
      LE.apiToken = token;
      LE.authRequired = false;
      LE.bound = false;
      await ensureRegistered();
      renderPanel();
    };
    panel.querySelector('#le-bind').onclick = async () => {
      const s = panel.querySelector('#le-sessin').value.trim();
      const w = panel.querySelector('#le-wsin').value.trim();
      if (!s || !w) return alert('Fill Local Codex session id and workspace folder');
      await saveLocalBinding(LE.conversationId, s, w);
      LE.bound = false; await ensureRegistered(); renderPanel();
    };
    panel.querySelector('#le-brief-generate').onclick = async () => {
      const objective = panel.querySelector('#le-brief-objective').value.trim();
      if (!objective) return alert('Fill an objective for this briefing');
      const r = await postControl('/api/briefing/materialize', {
        conversationId: LE.conversationId,
        objective,
      });
      if (!(r && r.ok && r.status === 200 && r.json.ok)) {
        return alert('Briefing generation failed: ' + ((r && r.json && (r.json.error || r.json.reason)) || (r && r.error) || (r && r.status) || LE.lastControlError || 'unknown'));
      }
      LE.briefing = r.json.briefing || null;
      renderPanel();
    };
    panel.querySelector('#le-brief-copy').onclick = async () => {
      const r = await bridge('/api/briefing?conversationId=' + encodeURIComponent(LE.conversationId), 'GET');
      if (!(r.ok && r.status === 200 && r.json.gptBrief)) {
        return alert('No GPT brief found. Generate briefing first.');
      }
      const ok = await copyText(r.json.gptBrief);
      alert(ok ? 'GPT brief copied' : 'Copy failed');
    };
    async function armAndMaybeSeed(action) {
      if (LE.armPending) return;
      LE.armPending = true;
      renderPanel();
      const conversationId = LE.conversationId;
      try {
        const seedBox = panel.querySelector('#le-seed');
        const mode = await postControl('/api/mode', { conversationId: LE.conversationId, action });
        if (!(mode && mode.json && mode.json.ok)) return;
        LE.userHold = false;
        LE.local = 'idle';
        resetProtocolRecovery();
        LE.seedSubmitUnconfirmed = false;
        LE.conversationMode = mode.json.conversationMode || 'armed';
        LE.loopState = mode.json.loopState || 'running';
        syncArmState(mode.json);
        LE.lastSig = sigOf(latestAssistant());
        const seed = seedBox.value.trim();
        if (seed) {
          LE.local = 'awaiting_assistant';
          const sent = await submitToGPT(seed + '\n' + contractText());
          if (conversationId !== readConversationId() || LE.userHold || !activeMode()) return;
          if (sent) seedBox.value = '';
          else if (LE.local === 'awaiting_assistant') {
            const ready = await waitForFreshReadyCodex(SEED_FRESH_CODEX_CONFIRM_MS);
            if (conversationId !== readConversationId() || LE.userHold || !activeMode()) return;
            if (LE.local !== 'awaiting_assistant') return;
            if (ready) {
              seedBox.value = '';
              LE.local = 'awaiting_assistant';
              LE.seedSubmitUnconfirmed = false;
              log('seed submit not confirmed by user bubble, but fresh turn-token codex block seen');
              scheduleTick(DOM_NUDGE_MS);
            } else {
              LE.local = 'awaiting_assistant';
              LE.seedSubmitUnconfirmed = true;
              log('seed submit not confirmed; staying armed until arm TTL or manual Chat Mode');
              scheduleTick(FAST_POLL_MS);
            }
          }
        }
      } finally {
        LE.armPending = false;
        renderPanel();
      }
    }

    panel.querySelector('#le-send').onclick = () => armAndMaybeSeed('arm_once');
    panel.querySelector('#le-arm-loop').onclick = () => armAndMaybeSeed('arm_loop');
    panel.querySelector('#le-seed-starter').onclick = () => {
      panel.querySelector('#le-seed').value = starterSeed();
    };
    panel.querySelector('#le-chat').onclick = async () => {
      const mode = await postControl('/api/mode', { conversationId: LE.conversationId, action: 'chat' });
      if (mode) {
        LE.local = 'idle';
        LE.userHold = true;
        LE.seedSubmitUnconfirmed = false;
        LE.lastSig = sigOf(latestAssistant());
        resetProtocolRecovery();
      }
      renderPanel();
    };
    panel.querySelector('#le-compact-pause').onclick = () => panel.querySelector('#le-chat').click();
    panel.querySelector('#le-freeze').onclick = async () => {
      const mode = await postControl('/api/mode', { conversationId: LE.conversationId, action: 'freeze' });
      if (mode) {
        LE.local = 'idle';
        LE.userHold = true;
        LE.seedSubmitUnconfirmed = false;
        LE.lastSig = sigOf(latestAssistant());
        resetProtocolRecovery();
      }
      renderPanel();
    };
    panel.querySelector('#le-debug-snapshot').onclick = async () => {
      const snapshot = JSON.stringify(debugSnapshot(), null, 2);
      const ok = await copyText(snapshot);
      alert(ok ? 'Debug snapshot copied' : 'Debug snapshot copy failed');
    };
    panel.querySelector('#le-approve').onclick = async () => {
      const r = await postControl('/api/control', { conversationId: LE.conversationId, action: 'approve' });
      if (r) LE.local = 'dispatching';
    };
    panel.querySelector('#le-skip').onclick = async () => {
      await postControl('/api/control', { conversationId: LE.conversationId, action: 'skip' });
    };
    panel.querySelector('#le-stop').onclick = () => { panel.querySelector('#le-confirm').style.display = 'block'; };
    panel.querySelector('#le-stop-no').onclick = () => { panel.querySelector('#le-confirm').style.display = 'none'; };
    panel.querySelector('#le-stop-yes').onclick = async () => {
      const r = await postControl('/api/control', { conversationId: LE.conversationId, action: 'stop', confirmed: true });
      if (r) panel.querySelector('#le-confirm').style.display = 'none';
    };
  }

  function pill(el, cls, txt) { el.className = 'pill ' + cls; el.textContent = txt; }
  function renderPanel() {
    if (!panel) buildPanel();
    const $ = s => panel.querySelector(s);
    const ready = currentReadyCodex();
    if (!$('#le-bridge-url').value) $('#le-bridge-url').value = LE.bridgeUrl || DEFAULT_BRIDGE_URL;
    pill($('#le-bridge'), LE.bridgeOk ? 'le-ok' : 'le-bad', LE.bridgeOk ? 'online' : 'not running');
    $('#le-tokenbox').style.display = LE.authRequired ? 'block' : 'none';
    const needsConnection = LE.authRequired || (LE.conversationId && !LE.bound && LE.bridgeOk);
    if (needsConnection && !$('#le-connection').dataset.needsConnection) $('#le-connection').open = true;
    $('#le-connection').dataset.needsConnection = needsConnection ? 'true' : '';
    $('#le-conv').textContent = LE.conversationId ? LE.conversationId.slice(0, 8) + '...' : '(none)';
    $('#le-sess').textContent = LE.codexSessionId ? LE.codexSessionId.slice(0, 8) + '...' : '-';
    const modeMap = { chat: 'le-ok', armed: 'le-warn', running: 'le-run', review: 'le-run', frozen: 'le-bad' };
    const modeText = LE.conversationMode === 'running'
      ? 'running - ' + LE.local
      : (LE.conversationMode || 'chat');
    pill($('#le-state'), modeMap[LE.conversationMode] || 'le-run', modeText);
    const leaderOk = isCurrentLeader();
    const compactProblem = LE.lastControlError || LE.bridgeError || LE.authRequired || LE.blockedPayload || LE.needsProtocolFix || LE.resultDeliveryUnconfirmed;
    const compactText = !LE.bridgeOk ? 'Bridge offline' : LE.bound && !leaderOk ? 'Not leader'
      : compactProblem ? 'Needs attention' : !LE.bound ? 'Not connected' : modeText;
    pill($('#le-compact-state'), compactProblem || !LE.bridgeOk || (LE.bound && !leaderOk) ? 'le-bad' : (modeMap[LE.conversationMode] || 'le-warn'), compactText);
    $('#le-compact-state').title = LE.lastControlError || LE.bridgeError || compactText;
    const leaseSeconds = Math.ceil(leaderLeaseMsLeft() / 1000);
    if (!LE.bound) pill($('#le-leader'), 'le-warn', 'not connected');
    else pill($('#le-leader'), leaderOk ? 'le-ok' : 'le-bad', leaderOk ? 'leader' : 'not leader');
    $('#le-client').textContent = `${shortId(LE.clientId)} / ${leaseSeconds ? leaseSeconds + 's' : '-'}`;
    const cap = LE.capsule;
    if (cap && cap.enabled) {
      const rootOk = /\\runs\\|\/runs\//i.test(cap.allowedWriteRoot || '') || /AegisLoopRuntime/i.test(cap.allowedWriteRoot || '');
      pill($('#le-capsule-state'), rootOk ? 'le-ok' : 'le-warn', rootOk ? 'enabled' : 'check root');
      $('#le-cap-project').textContent = cap.projectId || '-';
      $('#le-cap-branch').textContent = cap.activeBranch || '-';
      $('#le-cap-mode').textContent = cap.mode || '-';
      $('#le-cap-run').textContent = cap.runId || '-';
      $('#le-cap-root').textContent = cap.allowedWriteRoot ? 'external' : '-';
    } else {
      pill($('#le-capsule-state'), 'le-warn', 'legacy');
      $('#le-cap-project').textContent = '-';
      $('#le-cap-branch').textContent = '-';
      $('#le-cap-mode').textContent = '-';
      $('#le-cap-run').textContent = '-';
      $('#le-cap-root').textContent = 'workspace';
    }
    const brief = LE.briefing || {};
    const briefClass = brief.status === 'ready' ? 'le-ok'
      : (brief.status === 'stale' ? 'le-warn' : (brief.status === 'unavailable' ? 'le-bad' : 'le-warn'));
    pill($('#le-brief-state'), briefClass, brief.status || 'missing');
    $('#le-brief-inbox').textContent = brief.inbox ? 'external inbox' : (brief.reason || '-');
    if (brief.meta && brief.meta.objective && !$('#le-brief-objective').value) {
      $('#le-brief-objective').value = brief.meta.objective;
    }
    $('#le-reason').textContent = LE.lastControlError
      ? ('control: ' + String(LE.lastControlError).slice(0, 120))
      : LE.bridgeError
      ? ('bridge: ' + String(LE.bridgeError).slice(0, 120))
      : (LE.resultDeliveryUnconfirmed
        ? ('Result delivery attempted but unconfirmed: ' + String(LE.resultDeliveryUnconfirmed).slice(0, 18))
        : (LE.seedSubmitUnconfirmed && activeMode()
        ? 'Seed send was not confirmed; still armed and waiting until arm TTL.'
        : (LE.pauseReason ? ('reason: ' + LE.pauseReason) : '')));
    $('#le-bindbox').style.display = (LE.conversationId && !LE.bound && LE.bridgeOk) ? 'block' : 'none';
    $('#le-blocked').style.display = LE.blockedPayload ? 'block' : 'none';
    if (LE.blockedPayload) $('#le-blocked-rule').textContent = 'rule: ' + LE.blockedPayload.rule + ' - ' + (LE.blockedPayload.prompt || '').slice(0, 80) + '...';
    if (LE.bound && !leaderOk) pill($('#le-simple'), 'le-bad', 'Not leader: close the duplicate tab or wait for the lease to expire.');
    else if (LE.resultDeliveryUnconfirmed) pill($('#le-simple'), 'le-warn', 'Result delivery is unconfirmed; check the last user bubble before retrying.');
    else if (LE.needsProtocolFix || LE.pauseReason === 'needs_user_protocol_fix') pill($('#le-simple'), 'le-warn', 'Protocol fix needed: ask GPT for one visible codex JSON block.');
    else if (LE.seedSubmitUnconfirmed && activeMode()) pill($('#le-simple'), 'le-warn', 'Seed unconfirmed: still armed, waiting for fresh turn-token block.');
    else if (LE.conversationMode === 'chat') pill($('#le-simple'), 'le-ok', 'Chat mode: automation is off.');
    else if (LE.conversationMode === 'frozen') pill($('#le-simple'), 'le-bad', 'Frozen: this thread cannot execute.');
    else if (LE.local === 'dispatching') pill($('#le-simple'), 'le-run', 'Codex is running. Wait for result.');
    else if (LE.local === 'inserting') pill($('#le-simple'), 'le-run', 'Sending Codex result to GPT.');
    else if (ready) pill($('#le-simple'), 'le-ok', 'Armed: fresh turn-token block is ready.');
    else if (LE.conversationMode === 'armed') pill($('#le-simple'), 'le-warn', 'Armed: waiting for a fresh turn-token block.');
    else if (LE.conversationMode === 'review') pill($('#le-simple'), 'le-warn', 'Review: waiting for GPT next step with the turn token.');
    else pill($('#le-simple'), 'le-warn', 'Idle.');
    LE.selectorHealth = selectorHealth();
    const h = LE.selectorHealth;
    const selectorOk = h.composer && h.assistants + h.users > 0;
    pill($('#le-sel-state'), selectorOk ? 'le-ok' : 'le-warn', selectorOk ? 'ok' : 'check');
    $('#le-sel-controls').textContent = `C:${h.composer ? 'y' : 'n'} S:${h.send ? 'y' : 'n'} Stop:${h.stop ? 'y' : 'n'}`;
    $('#le-sel-counts').textContent = `A:${h.assistants} U:${h.users}`;
    $('#le-sel-sigs').textContent = `A:${String(h.latestAssistantSig).slice(0, 18)} U:${String(h.latestUserSig).slice(0, 18)}`;
    const showSeed = LE.local !== 'dispatching' && LE.local !== 'inserting';
    $('#le-seed-label').style.display = showSeed ? 'block' : 'none';
    $('#le-seed').style.display = showSeed ? 'block' : 'none';
    const controlsDisabled = !LE.bound || !LE.bridgeOk || LE.authRequired || !!(LE.bound && !leaderOk);
    ['#le-chat', '#le-send', '#le-arm-loop', '#le-freeze', '#le-approve', '#le-skip', '#le-stop', '#le-stop-yes'].forEach((selector) => {
      const el = $(selector);
      if (el) el.disabled = controlsDisabled;
    });
    $('#le-compact-pause').disabled = controlsDisabled || !activeMode();
    $('#le-send').disabled = controlsDisabled || LE.armPending;
    $('#le-arm-loop').disabled = controlsDisabled || LE.armPending;
  }

  // ----------------------------------------------------------------------------
  // Startup
  // ----------------------------------------------------------------------------
  buildPanel();
  Promise.all([loadApiToken(), loadBridgeUrl()]).then(([token, bridgeUrl]) => {
    LE.apiToken = token || null;
    try {
      LE.bridgeUrl = normalizeBridgeUrlForPanel(bridgeUrl);
      if (LE.bridgeUrl !== bridgeUrl) saveBridgeUrl(LE.bridgeUrl);
    } catch (e) {
      LE.bridgeUrl = DEFAULT_BRIDGE_URL;
      LE.bridgeError = 'Saved bridge URL was invalid and was reset to the default.';
      saveBridgeUrl(DEFAULT_BRIDGE_URL);
    }
    renderPanel();
    scheduleTick(0);
  });
  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (panel && panel.contains(mutation.target)) continue;
      nudgeTick();
      break;
    }
  });
  mo.observe(document.querySelector('main') || document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  log('content.js ready', CONTENT_VERSION);
})();
