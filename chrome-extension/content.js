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
 * If the loop stalls, turn on debug (top-right of the panel) and watch the
 * console for whether it finds the composer / send button / message nodes,
 * then adjust SELECTORS. Nothing else should need changing.
 * ============================================================================
 */
(() => {
  'use strict';
  if (window.__LE_LOADED__) return;          // guard against double injection
  window.__LE_LOADED__ = true;
  const CONTENT_VERSION = '0.3.7';
  const CONTRACT_VERSION = 'le-3.3';
  const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:17380';
  const FAST_POLL_MS = 800;
  const IDLE_POLL_MS = 3500;
  const DOM_NUDGE_MS = 250;

  // ----------------------------------------------------------------------------
  // SELECTORS - fix these first if the DOM changes (all have fallbacks)
  // ----------------------------------------------------------------------------
  const SEL = {
    composer() {
      return document.querySelector('#prompt-textarea')
          || document.querySelector('form [contenteditable="true"]')
          || document.querySelector('div[contenteditable="true"]')
          || document.querySelector('form textarea')
          || document.querySelector('textarea');
    },
    sendButton() {
      return document.querySelector('button[data-testid="send-button"]')
          || document.querySelector('button[aria-label*="Send" i]')
          || document.querySelector('form button[type="submit"]');
    },
    stopButton() {
      return document.querySelector('button[data-testid="stop-button"]')
          || document.querySelector('button[aria-label*="Stop" i]');
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
    const nonce = LE.armNonce || 'ARM_NONCE_FROM_PANEL';
    return [
      '',
      `[AegisLoop protocol ${CONTRACT_VERSION}]`,
      'Evaluate the Codex result above, then give the next step.',
      'AegisLoop is NOT a built-in ChatGPT tool. Do not try to call a tool.',
      'If you are in a Pro or reasoning mode, do not answer with a tool-availability disclaimer.',
      'To use local Codex, write the next instruction as plain JSON inside a fenced ```codex block.',
      'Your reply MUST end with exactly one of these:',
      '1) one fenced ```codex block with JSON containing the current arm_nonce and the next instruction. Example:',
      '```codex',
      `{"aegisloop":true,"arm_nonce":"${nonce}","prompt":"Next task. Keep research_only=true and approved_for_scoring=false."}`,
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
    return [
      '[AegisLoop] Your last reply had no usable fenced codex block.',
      'AegisLoop is not a built-in ChatGPT tool. Do not call or search for tools.',
      'Do not answer that the tool is unavailable; AegisLoop reads visible page text after you reply.',
      'Reply with ONLY one JSON fenced codex block containing arm_nonce="' + (LE.armNonce || 'ARM_NONCE_FROM_PANEL') + '" and the next instruction,',
      'or output exactly one line <<<LOOP_STOP>>> if the task is complete. Nothing else.',
    ].join('\n');
  }

  function starterSeed() {
    return [
      'Read the AegisLoop GPT brief above if present.',
      'This is a runner thread, not a normal Q&A thread.',
      'Do not call ChatGPT tools. AegisLoop works by reading your fenced codex JSON block.',
      'If you are a Pro or reasoning model, still write page text instead of looking for a tool.',
      'Give the smallest safe next local Codex task for the current project/branch/objective.',
      'If the task should stop, reply exactly <<<LOOP_STOP>>>.',
    ].join('\n');
  }

  // ----------------------------------------------------------------------------
  // State
  // ----------------------------------------------------------------------------
  const LE = {
    conversationId: null,
    bound: false,
    codexSessionId: null,
    workspaceDir: null,
    bridgeUrl: DEFAULT_BRIDGE_URL,
    bridgeError: null,
    apiToken: null,
    authRequired: false,
    conversationMode: 'chat',
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
    debug: false,
    ticking: false,
    userHold: false,               // true after a manual Pause, blocks auto-resume
  };
  const MAX_REFORMAT = 3;
  function log(...a) { if (LE.debug) console.log('%c[LE]', 'color:#0a0', ...a); }

  // ----------------------------------------------------------------------------
  // Bridge comms (via background relay, to avoid https->http mixed content)
  // ----------------------------------------------------------------------------
  function bridge(pathAndQuery, method, body) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'BRIDGE', path: pathAndQuery, method, body, token: LE.apiToken, bridgeUrl: LE.bridgeUrl }, (resp) => {
          const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
          if (err || !resp) {
            LE.bridgeError = err || 'empty bridge response';
            return resolve({ ok: false, error: LE.bridgeError });
          }
          if (!resp.ok) LE.bridgeError = resp.error || 'bridge request failed';
          else LE.bridgeError = null;
          if (resp.status === 401) LE.authRequired = true;
          resolve(resp);
        });
      } catch (e) {
        LE.bridgeError = String(e && e.message || e);
        resolve({ ok: false, error: LE.bridgeError });
      }
    });
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
    if (!id) { LE.conversationId = null; LE.bound = false; return; }
    if (id === LE.conversationId && LE.bound) return;
    LE.conversationId = id;
    const stored = await loadLocalBinding(id);
    const r = await bridge('/api/register', 'POST', {
      conversationId: id,
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
      LE.armNonce = r.json.armNonce || null;
      LE.armExpiresAt = r.json.armExpiresAt || 0;
      LE.armDispatches = r.json.armDispatches || 0;
      LE.armMaxDispatches = r.json.armMaxDispatches || 0;
      LE.bridgeOk = true;
      LE.authRequired = false;
      log('registered', id, '->', LE.codexSessionId, LE.workspaceDir);
    } else if (r.ok && r.status === 409) {
      LE.bound = false;            // unknown conversation, fill Codex Session ID in the panel
      LE.bridgeOk = true;
      LE.authRequired = false;
    } else if (r.ok && r.status === 401) {
      LE.bound = false;
      LE.bridgeOk = true;
      LE.authRequired = true;
    } else {
      LE.bridgeOk = false;         // bridge not up
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
  function userMsgCount() {
    return SEL.messages().filter(m => m.role === 'user').length;
  }
  function isStreaming() { return !!SEL.stopButton(); }

  function sigOf(a) { return a ? `${a.count}|${a.text.length}|${djb2(a.text.slice(-120))}` : null; }
  function djb2(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h >>> 0; }

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
    let armNonce = null;
    if (!prompt) return null;
    try {
      const j = JSON.parse(prompt);
      if (j && typeof j.prompt === 'string') {
        prompt = j.prompt;
        armNonce = j.arm_nonce || j.armNonce || null;
      }
    } catch (e) { /* treat as plain-text prompt */ }
    prompt = String(prompt).trim();
    return prompt ? { prompt, armNonce } : null;
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

  function canDispatchParsed(parsed) {
    if (!parsed || !parsed.prompt) return false;
    if (!['armed', 'review'].includes(LE.conversationMode)) return false;
    return !!LE.armNonce && parsed.armNonce === LE.armNonce;
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
    if (btn && !btn.disabled) { btn.click(); return true; }
    const el = SEL.composer();
    if (el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      return true;
    }
    return false;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const normPrefix = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  const containsMarker = (text, marker) => {
    const a = String(text || '').replace(/\s+/g, ' ').trim();
    const b = String(marker || '').replace(/\s+/g, ' ').trim();
    if (!a || !b) return false;
    return a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12));
  };

  // Send to GPT and CONFIRM by reading back a new matching user message.
  // We do NOT gate on "composer is empty" - ChatGPT clears its own composer on
  // a successful send; if a cosmetic draft remains we tidy it but never fail on it.
  async function submitToGPT(text) {
    const marker = normPrefix(text);
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = userMsgCount();
      if (!setComposerText(text)) return false;
      await sleep(150);
      clickSend();
      const t0 = Date.now();
      while (Date.now() - t0 < (attempt === 0 ? 12000 : 8000)) {
        await sleep(500);
        const users = SEL.messages().filter(m => m.role === 'user');
        if (users.length > before) {
          const lastUser = normPrefix(users[users.length - 1].text);
          if (!marker || containsMarker(lastUser, marker)) {
            if (composerText()) clearComposer();   // best-effort tidy, not required
            log('submit confirmed (new user message seen)');
            return true;
          }
        }
      }
      log('submit not confirmed, retrying');
      clearComposer();
      await sleep(200);
    }
    return false;   // honest failure -> caller pauses for human
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
      LE.armNonce = me.armNonce || null;
      LE.armExpiresAt = me.armExpiresAt || 0;
      LE.armDispatches = me.armDispatches || 0;
      LE.armMaxDispatches = me.armMaxDispatches || 0;

      if (LE.conversationMode === 'chat' || LE.conversationMode === 'frozen') {
        LE.local = 'idle';
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
        const rr = await bridge('/api/result?conversationId=' + encodeURIComponent(LE.conversationId), 'GET');
        if (rr.ok && rr.json.hasResult) {
          const result = rr.json.result;
          log('got codex result, inserting to GPT', result.jobId, 'ok=', result.ok);
          LE.local = 'inserting';
          const payload = result.finalMessage + '\n' + contractText();
          const sent = await submitToGPT(payload);
          if (sent) {
            await bridge('/api/result/ack', 'POST', {
              conversationId: LE.conversationId,
              jobId: result.jobId,
            });
            LE.local = 'awaiting_assistant';
            LE.reformatCount = 0;
          }
          else {
            LE.local = 'idle';
            await bridge('/api/result/nack', 'POST', {
              conversationId: LE.conversationId,
              jobId: result.jobId,
              reason: 'result_insert_failed',
            });
            log('insert failed -> paused for human');
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
        LE.lastSig = sig;
        await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'chat', reason: 'loop_stop_requested' });
        log('GPT requested LOOP_STOP -> chat mode');
        return;
      }

      if (parsed && parsed.prompt && canDispatchParsed(parsed)) {
        const d = await bridge('/api/dispatch', 'POST', {
          conversationId: LE.conversationId,
          prompt: parsed.prompt,
          armNonce: parsed.armNonce,
        });
        LE.lastSig = sig;
        if (d.ok && d.json.status === 'accepted') {
          LE.local = 'dispatching';
          LE.reformatCount = 0;
          log('dispatched to codex, waiting result');
        } else if (d.ok && d.json.status === 'busy') {
          LE.local = 'dispatching';
          LE.reformatCount = 0;
          log('conversation already has an active dispatch, waiting result');
        } else if (d.ok && d.json.status === 'duplicate') {
          LE.local = 'idle';
          await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'chat', reason: 'duplicate_payload' });
          log('duplicate payload -> paused for human');
        } else if (d.ok && (d.json.status === 'blocked' || d.json.status === 'not_running')) {
          log('dispatch blocked/not_running:', d.json);
        }
        return;
      }

      // No executable codex block. Nudge GPT back onto the protocol, bounded by
      // MAX_REFORMAT; only pause for the human once the budget is spent. This is
      // what lets the loop keep going when GPT forgets to emit a codex block.
      LE.lastSig = sig;
      if (!LE.userHold && LE.reformatCount < MAX_REFORMAT) {
        LE.reformatCount++;
        log('no codex block -> reformat nudge', LE.reformatCount, '/', MAX_REFORMAT);
        const sent = await submitToGPT(reformatMsg());
        if (sent) { LE.local = 'awaiting_assistant'; }
        else {
          LE.local = 'idle';
          await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'chat', reason: 'reformat_submit_failed' });
        }
      } else {
        LE.local = 'idle';
        await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'chat', reason: 'assistant_missing_codex' });
        log('no codex block and reformat budget spent -> paused for human');
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
  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'le-panel';
    panel.innerHTML = `
      <style>
        #le-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:340px;max-height:86vh;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#e6e6e6;background:#15171c;border:1px solid #2a2e37;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden}
        #le-panel header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1b1e25;border-bottom:1px solid #2a2e37}
        #le-panel header b{font-size:12px;letter-spacing:.3px}
        #le-panel .body{padding:10px;display:flex;flex-direction:column;gap:8px;max-height:calc(86vh - 42px);overflow:auto}
        #le-panel .row{display:flex;gap:6px;align-items:center;justify-content:space-between}
        #le-panel .k{color:#8a93a3}
        #le-panel .pill{padding:1px 7px;border-radius:999px;font-size:11px}
        #le-panel input{width:100%;background:#0f1115;border:1px solid #2a2e37;color:#e6e6e6;border-radius:6px;padding:5px 7px}
        #le-panel textarea{width:100%;height:54px;background:#0f1115;border:1px solid #2a2e37;color:#e6e6e6;border-radius:6px;padding:6px 7px;resize:vertical}
        #le-panel button{cursor:pointer;border:1px solid #2a2e37;background:#222632;color:#e6e6e6;border-radius:6px;padding:5px 8px;font:inherit}
        #le-panel button:hover{background:#2a2f3d}
        #le-panel button.danger{background:#3a1c1f;border-color:#5a2a2e;color:#ffb4b4}
        #le-panel button.go{background:#16331f;border-color:#2a5a36;color:#b6ffc8}
        #le-panel .muted{color:#8a93a3;font-size:11px}
        #le-panel .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
        #le-panel .capsule{border:1px solid #2a2e37;border-radius:8px;padding:7px;background:#11141a}
        #le-panel .steps{margin:6px 0 0 18px;padding:0;color:#cdd4e0}
        #le-panel .steps li{margin:2px 0}
        #le-panel .tip{color:#8a93a3;font-size:11px;margin-top:5px}
        .le-ok{background:#16331f;color:#b6ffc8}.le-warn{background:#3a2f12;color:#ffe39a}.le-bad{background:#3a1c1f;color:#ffb4b4}.le-run{background:#13283a;color:#9fd2ff}
      </style>
      <header><b>AegisLoop <span class="muted" id="le-ver">v${CONTENT_VERSION}</span></b><button id="le-dbg" title="debug log">debug</button></header>
      <div class="body">
        <div class="row"><span class="k">Local bridge</span><span id="le-bridge" class="pill le-bad">not running</span></div>
        <div class="grid"><input id="le-bridge-url" placeholder="http://127.0.0.1:17380" /><button id="le-bridge-save">Save URL</button></div>
        <div id="le-tokenbox" style="display:none">
          <div class="pill le-warn">Bridge token required</div>
          <input id="le-token" type="password" placeholder="X-AegisLoop-Token" style="margin-top:6px" />
          <button id="le-token-save" class="go" style="width:100%;margin-top:6px">Save token</button>
        </div>
        <div class="row"><span class="k">ChatGPT tab</span><span id="le-conv" class="muted">-</span></div>
        <div class="row"><span class="k">Local Codex session</span><span id="le-sess" class="muted">-</span></div>
        <div class="row"><span class="k">Mode</span><span id="le-state" class="pill le-run">-</span></div>
        <div id="le-guide" class="capsule">
          <div class="row"><span class="k">Start here</span><span class="pill le-run">4 steps</span></div>
          <ol class="steps">
            <li>Run <b>npm run doctor</b> locally.</li>
            <li>Connect this ChatGPT tab to Codex.</li>
            <li>Generate briefing, then paste GPT brief.</li>
            <li>Use starter text, then Arm one run.</li>
          </ol>
          <div class="tip">Use a dedicated runner thread. Switching GPT models keeps the same Codex route while the ChatGPT conversation URL stays the same.</div>
          <div class="tip">If a Pro or GPT-5.x model says no tool is available, keep this route and ask it for a visible codex JSON block.</div>
        </div>
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
        <div id="le-reason" class="muted"></div>
        <div id="le-bindbox" style="display:none">
          <div class="muted">Connect this ChatGPT tab to a local Codex session.</div>
          <input id="le-sessin" placeholder="Local Codex session id (019f...)" />
          <input id="le-wsin" placeholder="Workspace folder, e.g. C:\\my-project" />
          <button id="le-bind" class="go" style="width:100%;margin-top:6px">Connect this chat</button>
        </div>
        <div id="le-blocked" style="display:none">
          <div class="pill le-warn">Needs approval</div>
          <div id="le-blocked-rule" class="muted"></div>
          <div class="grid" style="margin-top:6px"><button id="le-approve" class="go">Allow once</button><button id="le-skip">Skip</button></div>
        </div>
        <div id="le-simple" class="pill le-run">checking...</div>
        <div id="le-seed-label" class="muted">First instruction (optional)</div>
        <textarea id="le-seed" placeholder="Recommended: click Use starter text, then Arm one run."></textarea>
        <button id="le-seed-starter">Use starter text</button>
        <div class="grid"><button id="le-chat">Chat mode</button><button id="le-send" class="go">Arm one run</button></div>
        <div class="grid"><button id="le-arm-loop" class="go">Arm loop</button><button id="le-freeze">Freeze</button></div>
        <button id="le-stop" class="danger" style="width:100%">Stop</button>
        <div id="le-confirm" style="display:none"><div class="pill le-bad">Confirm stop?</div><div class="grid" style="margin-top:6px"><button id="le-stop-yes" class="danger">Confirm</button><button id="le-stop-no">Cancel</button></div></div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#le-dbg').onclick = () => { LE.debug = !LE.debug; panel.querySelector('#le-dbg').style.color = LE.debug ? '#b6ffc8' : ''; };
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
      const r = await bridge('/api/briefing/materialize', 'POST', {
        conversationId: LE.conversationId,
        objective,
      });
      if (!(r.ok && r.status === 200 && r.json.ok)) {
        return alert('Briefing generation failed: ' + ((r.json && (r.json.error || r.json.reason)) || r.error || r.status));
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
      const seedBox = panel.querySelector('#le-seed');
      const mode = await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action });
      if (!(mode.ok && mode.status === 200 && mode.json.ok)) return;
      LE.userHold = false;
      LE.local = 'idle';
      LE.reformatCount = 0;
      LE.conversationMode = mode.json.conversationMode || 'armed';
      LE.loopState = mode.json.loopState || 'running';
      LE.armNonce = mode.json.armNonce || null;
      LE.armExpiresAt = mode.json.armExpiresAt || 0;
      LE.armDispatches = mode.json.armDispatches || 0;
      LE.armMaxDispatches = mode.json.armMaxDispatches || 0;
      LE.lastSig = sigOf(latestAssistant());
      const seed = seedBox.value.trim();
      if (seed) {
        LE.local = 'awaiting_assistant';
        const sent = await submitToGPT(seed + '\n' + contractText());
        if (sent) seedBox.value = '';
        else {
          LE.local = 'idle';
          await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'chat', reason: 'seed_submit_not_confirmed' });
        }
      }
      renderPanel();
    }

    panel.querySelector('#le-send').onclick = () => armAndMaybeSeed('arm_once');
    panel.querySelector('#le-arm-loop').onclick = () => armAndMaybeSeed('arm_loop');
    panel.querySelector('#le-seed-starter').onclick = () => {
      panel.querySelector('#le-seed').value = starterSeed();
    };
    panel.querySelector('#le-chat').onclick = async () => {
      LE.local = 'idle';
      LE.userHold = true;
      LE.lastSig = sigOf(latestAssistant());
      LE.reformatCount = 0;
      await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'chat' });
      renderPanel();
    };
    panel.querySelector('#le-freeze').onclick = async () => {
      LE.local = 'idle';
      LE.userHold = true;
      LE.lastSig = sigOf(latestAssistant());
      LE.reformatCount = 0;
      await bridge('/api/mode', 'POST', { conversationId: LE.conversationId, action: 'freeze' });
      renderPanel();
    };
    panel.querySelector('#le-approve').onclick = () => bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'approve' }).then(() => { LE.local = 'dispatching'; });
    panel.querySelector('#le-skip').onclick = () => bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'skip' });
    panel.querySelector('#le-stop').onclick = () => { panel.querySelector('#le-confirm').style.display = 'block'; };
    panel.querySelector('#le-stop-no').onclick = () => { panel.querySelector('#le-confirm').style.display = 'none'; };
    panel.querySelector('#le-stop-yes').onclick = async () => {
      await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'stop', confirmed: true });
      panel.querySelector('#le-confirm').style.display = 'none';
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
    $('#le-conv').textContent = LE.conversationId ? LE.conversationId.slice(0, 8) + '...' : '(none)';
    $('#le-sess').textContent = LE.codexSessionId ? LE.codexSessionId.slice(0, 8) + '...' : '-';
    const modeMap = { chat: 'le-ok', armed: 'le-warn', running: 'le-run', review: 'le-run', frozen: 'le-bad' };
    const modeText = LE.conversationMode === 'running'
      ? 'running - ' + LE.local
      : (LE.conversationMode || 'chat');
    pill($('#le-state'), modeMap[LE.conversationMode] || 'le-run', modeText);
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
    $('#le-reason').textContent = LE.bridgeError ? ('bridge: ' + String(LE.bridgeError).slice(0, 120)) : (LE.pauseReason ? ('reason: ' + LE.pauseReason) : '');
    $('#le-bindbox').style.display = (LE.conversationId && !LE.bound && LE.bridgeOk) ? 'block' : 'none';
    $('#le-blocked').style.display = LE.blockedPayload ? 'block' : 'none';
    if (LE.blockedPayload) $('#le-blocked-rule').textContent = 'rule: ' + LE.blockedPayload.rule + ' - ' + (LE.blockedPayload.prompt || '').slice(0, 80) + '...';
    if (LE.conversationMode === 'chat') pill($('#le-simple'), 'le-ok', 'Chat mode: automation is off.');
    else if (LE.conversationMode === 'frozen') pill($('#le-simple'), 'le-bad', 'Frozen: this thread cannot execute.');
    else if (LE.local === 'dispatching') pill($('#le-simple'), 'le-run', 'Codex is running. Wait for result.');
    else if (LE.local === 'inserting') pill($('#le-simple'), 'le-run', 'Sending Codex result to GPT.');
    else if (ready) pill($('#le-simple'), 'le-ok', 'Armed: fresh nonce block is ready.');
    else if (LE.conversationMode === 'armed') pill($('#le-simple'), 'le-warn', 'Armed: waiting for a fresh nonce block.');
    else if (LE.conversationMode === 'review') pill($('#le-simple'), 'le-warn', 'Review: waiting for GPT next step with nonce.');
    else pill($('#le-simple'), 'le-warn', 'Idle.');
    const showSeed = LE.local !== 'dispatching' && LE.local !== 'inserting';
    $('#le-seed-label').style.display = showSeed ? 'block' : 'none';
    $('#le-seed').style.display = showSeed ? 'block' : 'none';
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
