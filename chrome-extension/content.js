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
  const CONTENT_VERSION = '2.3.1';

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
  const CONTRACT = [
    '',
    '[AegisLoop protocol le-2.0]',
    'Evaluate the Codex result above, then give the next step.',
    'Your reply MUST end with exactly one of these:',
    '1) one fenced ```codex block with the next instruction for local Codex,',
    '   either natural language or JSON with a "prompt" field. Example:',
    '```codex',
    '{"prompt":"Next task. Keep research_only=true and approved_for_scoring=false."}',
    '```',
    '2) if this loop should stop, output exactly one line:',
    '<<<LOOP_STOP>>>',
    'Do not put codexSessionId or workspaceDir inside the codex block.',
    'Do not output trading advice, price prediction, top list, production signal,',
    'commit, push, or anything that violates the local research gate.',
  ].join('\n');

  // Sent automatically when GPT replied but gave no usable codex block, to nudge
  // it back onto the protocol. Bounded by MAX_REFORMAT so it never spams.
  const REFORMAT_MSG = [
    '[AegisLoop] Your last reply had no usable ```codex block.',
    'Reply with ONLY one ```codex block containing the next instruction for local Codex,',
    'or output exactly one line <<<LOOP_STOP>>> if the task is complete. Nothing else.',
  ].join('\n');

  const CONTINUE_AFTER_STOP_MSG = [
    '[AegisLoop] The user clicked Continue after your LOOP_STOP.',
    'If there is a valid next step, reply with ONLY one ```codex block containing that instruction.',
    'If the loop is truly complete, output exactly one line <<<LOOP_STOP>>>. Nothing else.',
  ].join('\n');

  // ----------------------------------------------------------------------------
  // State
  // ----------------------------------------------------------------------------
  const LE = {
    conversationId: null,
    bound: false,
    codexSessionId: null,
    workspaceDir: null,
    fullAuto: true,
    bridgeOk: false,
    loopState: 'running',          // mirrors the bridge: running | paused | halted
    pauseReason: null,
    blockedPayload: null,
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
  function isRecoverablePauseReason(reason) {
    return !reason || [
      'manual',
      'assistant_missing_codex',
      'result_insert_failed',
      'seed_submit_not_confirmed',
      'loop_stop_requested',
    ].includes(reason);
  }

  // ----------------------------------------------------------------------------
  // Bridge comms (via background relay, to avoid https->http mixed content)
  // ----------------------------------------------------------------------------
  function bridge(pathAndQuery, method, body) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'BRIDGE', path: pathAndQuery, method, body }, (resp) => {
          const err = chrome.runtime.lastError && chrome.runtime.lastError.message;
          if (err || !resp) return resolve({ ok: false, error: err || 'empty bridge response' });
          resolve(resp);
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message || e) });
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
      LE.fullAuto = r.json.fullAuto !== false;
      LE.bridgeOk = true;
      log('registered', id, '->', LE.codexSessionId, LE.workspaceDir);
    } else if (r.ok && r.status === 409) {
      LE.bound = false;            // unknown conversation, fill Codex Session ID in the panel
      LE.bridgeOk = true;
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
    if (!prompt) return null;
    try {
      const j = JSON.parse(prompt);
      if (j && typeof j.prompt === 'string') prompt = j.prompt;
    } catch (e) { /* treat as plain-text prompt */ }
    prompt = String(prompt).trim();
    return prompt ? { prompt } : null;
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
    return parsed && parsed.prompt ? { assistant: a, parsed } : null;
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
  async function tick() {
    if (LE.ticking) return;
    LE.ticking = true;
    try {
      await ensureRegistered();
      renderPanel();
      if (!LE.conversationId || !LE.bound || !LE.bridgeOk) return;

      // On first run, baseline the latest assistant signature so we do not
      // re-dispatch an old message - UNLESS that message already has a codex
      // block (then we leave lastSig null so it gets picked up).
      if (!LE.initializedLatestSig) {
        const existing = latestAssistant();
        const existingParsed = existing && !isStreaming() ? extractCodex(existing) : null;
        LE.lastSig = existingParsed ? null : (existing ? sigOf(existing) : null);
        LE.initializedLatestSig = true;
        log('baseline assistant signature initialized', LE.lastSig);
      }

      // Pull authoritative state from the bridge.
      const cs = await bridge('/api/conversations', 'GET');
      if (!(cs.ok && cs.status === 200)) { LE.bridgeOk = false; return; }
      const me = (cs.json.conversations || []).find(c => c.conversationId === LE.conversationId);
      if (!me) { LE.bound = false; return; }
      LE.loopState = me.loopState;
      LE.pauseReason = me.pauseReason;
      LE.blockedPayload = me.blockedPayload || null;

      if (LE.loopState === 'paused' && (me.activeDispatchHash || me.hasPendingResult) && !LE.userHold && !LE.blockedPayload && isRecoverablePauseReason(LE.pauseReason)) {
        log('paused but bridge has active/pending work; resuming result polling');
        await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'resume' });
        LE.loopState = 'running';
        LE.pauseReason = null;
        LE.local = 'dispatching';
      }

      if (LE.loopState === 'running' && me.hasPendingResult && LE.local !== 'dispatching' && LE.local !== 'inserting') {
        log('bridge has a pending result; polling it now');
        LE.local = 'dispatching';
      }

      if (LE.loopState !== 'running') {
        // Auto-resume only when safe AND a fresh codex block is already on screen.
        const canAutoResume =
          LE.fullAuto &&
          LE.loopState === 'paused' &&
          !LE.userHold &&
          !LE.blockedPayload &&
          !me.activeDispatchHash &&
          isRecoverablePauseReason(LE.pauseReason);
        const pausedAssistant = canAutoResume && !isStreaming() ? latestAssistant() : null;
        const pausedCodex = pausedAssistant ? extractCodex(pausedAssistant) : null;
        if (pausedCodex && pausedCodex.prompt) {
          log('paused but a codex block is ready; auto-resuming');
          await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'resume' });
          LE.loopState = 'running';
          LE.pauseReason = null;
          LE.local = 'idle';
          LE.lastSig = null;
          LE.reformatCount = 0;
        } else {
          return;   // stay paused, wait for human or a fresh codex block
        }
      }

      // Waiting for a Codex result.
      if (LE.local === 'dispatching') {
        const rr = await bridge('/api/result?conversationId=' + encodeURIComponent(LE.conversationId), 'GET');
        if (rr.ok && rr.json.hasResult) {
          const result = rr.json.result;
          log('got codex result, inserting to GPT', result.jobId, 'ok=', result.ok);
          LE.local = 'inserting';
          const payload = result.finalMessage + '\n' + CONTRACT;
          const sent = await submitToGPT(payload);
          if (sent) { LE.local = 'awaiting_assistant'; LE.reformatCount = 0; }
          else {
            LE.local = 'idle';
            await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'result_insert_failed' });
            log('insert failed -> paused for human');
          }
        }
        return;
      }

      if (LE.local === 'inserting') return;

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
        await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'loop_stop_requested' });
        log('GPT requested LOOP_STOP -> paused, waiting for human confirm to stop');
        return;
      }

      if (parsed && parsed.prompt) {
        const d = await bridge('/api/dispatch', 'POST', { conversationId: LE.conversationId, prompt: parsed.prompt });
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
          await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'duplicate_payload' });
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
        const sent = await submitToGPT(REFORMAT_MSG);
        if (sent) { LE.local = 'awaiting_assistant'; }
        else {
          LE.local = 'idle';
          await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'reformat_submit_failed' });
        }
      } else {
        LE.local = 'idle';
        await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'assistant_missing_codex' });
        log('no codex block and reformat budget spent -> paused for human');
      }
      return;
    } catch (e) {
      log('tick error', e);
    } finally {
      LE.ticking = false;
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
        #le-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#e6e6e6;background:#15171c;border:1px solid #2a2e37;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.5);overflow:hidden}
        #le-panel header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#1b1e25;border-bottom:1px solid #2a2e37}
        #le-panel header b{font-size:12px;letter-spacing:.3px}
        #le-panel .body{padding:10px;display:flex;flex-direction:column;gap:8px}
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
        .le-ok{background:#16331f;color:#b6ffc8}.le-warn{background:#3a2f12;color:#ffe39a}.le-bad{background:#3a1c1f;color:#ffb4b4}.le-run{background:#13283a;color:#9fd2ff}
      </style>
      <header><b>AegisLoop <span class="muted" id="le-ver">v${CONTENT_VERSION}</span></b><button id="le-dbg" title="debug log">debug</button></header>
      <div class="body">
        <div class="row"><span class="k">bridge</span><span id="le-bridge" class="pill le-bad">offline</span></div>
        <div class="row"><span class="k">conversation</span><span id="le-conv" class="muted">-</span></div>
        <div class="row"><span class="k">codex session</span><span id="le-sess" class="muted">-</span></div>
        <div class="row"><span class="k">state</span><span id="le-state" class="pill le-run">-</span></div>
        <div id="le-reason" class="muted"></div>
        <div id="le-bindbox" style="display:none">
          <div class="muted">This conversation is not bound.</div>
          <input id="le-sessin" placeholder="codex sessionId (019f...)" />
          <input id="le-wsin" placeholder="workspaceDir, e.g. C:\\yiming_dev" />
          <button id="le-bind" class="go" style="width:100%;margin-top:6px">Bind conversation</button>
        </div>
        <div id="le-blocked" style="display:none">
          <div class="pill le-warn">Blocked by local gate</div>
          <div id="le-blocked-rule" class="muted"></div>
          <div class="grid" style="margin-top:6px"><button id="le-approve" class="go">Approve once</button><button id="le-skip">Skip</button></div>
        </div>
        <div id="le-simple" class="pill le-run">checking...</div>
        <div id="le-seed-label" class="muted">Only type here when this page has no codex block:</div>
        <textarea id="le-seed" placeholder="First task for GPT, e.g. continue from the current result."></textarea>
        <button id="le-send" class="go" style="width:100%">Run current codex / start</button>
        <div class="grid"><button id="le-resume" class="go" style="display:none">Continue</button><button id="le-pause">Pause</button><button id="le-stop" class="danger">Stop</button></div>
        <div id="le-confirm" style="display:none"><div class="pill le-bad">Confirm stop?</div><div class="grid" style="margin-top:6px"><button id="le-stop-yes" class="danger">Confirm</button><button id="le-stop-no">Cancel</button></div></div>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector('#le-dbg').onclick = () => { LE.debug = !LE.debug; panel.querySelector('#le-dbg').style.color = LE.debug ? '#b6ffc8' : ''; };
    panel.querySelector('#le-bind').onclick = async () => {
      const s = panel.querySelector('#le-sessin').value.trim();
      const w = panel.querySelector('#le-wsin').value.trim();
      if (!s || !w) return alert('Fill Codex Session ID and workspaceDir');
      await saveLocalBinding(LE.conversationId, s, w);
      LE.bound = false; await ensureRegistered(); renderPanel();
    };
    panel.querySelector('#le-send').onclick = async () => {
      const seedBox = panel.querySelector('#le-seed');

      // If GPT has already produced a usable codex block, the safest "start"
      // action is to dispatch that block directly. Do not inject another seed
      // message into ChatGPT, because that can race with an already-ready task.
      const ready = currentReadyCodex();
      if (ready) {
        if (LE.loopState !== 'running') await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'resume' });
        LE.userHold = false;
        LE.local = 'idle';
        LE.reformatCount = 0;
        const sig = sigOf(ready.assistant);
        const d = await bridge('/api/dispatch', 'POST', { conversationId: LE.conversationId, prompt: ready.parsed.prompt });
        LE.lastSig = sig;
        if (d.ok && (d.json.status === 'accepted' || d.json.status === 'busy')) {
          LE.local = 'dispatching';
          seedBox.value = '';
        } else if (d.ok && d.json.status === 'duplicate') {
          LE.local = 'idle';
          await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'duplicate_payload' });
        }
        return;
      }

      const seed = seedBox.value.trim();
      if (!seed) return;
      if (LE.loopState !== 'running') await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'resume' });
      LE.userHold = false;
      LE.local = 'awaiting_assistant';
      LE.reformatCount = 0;
      LE.lastSig = sigOf(latestAssistant());
      const sent = await submitToGPT(seed + '\n' + CONTRACT);
      if (sent) seedBox.value = '';
      else {
        LE.local = 'idle';
        await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'seed_submit_not_confirmed' });
      }
    };
    panel.querySelector('#le-pause').onclick = () => {
      LE.userHold = true;
      bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause' });
    };
    panel.querySelector('#le-resume').onclick = async () => {
      const wasLoopStop = LE.pauseReason === 'loop_stop_requested';
      LE.local = 'idle';
      LE.userHold = false;
      LE.lastSig = wasLoopStop ? sigOf(latestAssistant()) : null;
      LE.reformatCount = 0;
      await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'resume' });
      if (wasLoopStop) {
        const sent = await submitToGPT(CONTINUE_AFTER_STOP_MSG);
        LE.local = sent ? 'awaiting_assistant' : 'idle';
        if (!sent) {
          await bridge('/api/control', 'POST', { conversationId: LE.conversationId, action: 'pause', reason: 'continue_after_stop_submit_failed' });
        }
      }
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
    pill($('#le-bridge'), LE.bridgeOk ? 'le-ok' : 'le-bad', LE.bridgeOk ? 'online' : 'offline');
    $('#le-conv').textContent = LE.conversationId ? LE.conversationId.slice(0, 8) + '...' : '(none)';
    $('#le-sess').textContent = LE.codexSessionId ? LE.codexSessionId.slice(0, 8) + '...' : '-';
    const map = { running: 'le-run', paused: 'le-warn', halted: 'le-bad' };
    const label = { running: 'running', paused: 'paused', halted: 'halted' };
    pill($('#le-state'), map[LE.loopState] || 'le-run', (label[LE.loopState] || LE.loopState) + (LE.loopState === 'running' ? ' - ' + LE.local : ''));
    $('#le-reason').textContent = LE.pauseReason ? ('reason: ' + LE.pauseReason) : '';
    $('#le-bindbox').style.display = (LE.conversationId && !LE.bound && LE.bridgeOk) ? 'block' : 'none';
    $('#le-blocked').style.display = LE.blockedPayload ? 'block' : 'none';
    if (LE.blockedPayload) $('#le-blocked-rule').textContent = 'rule: ' + LE.blockedPayload.rule + ' - ' + (LE.blockedPayload.prompt || '').slice(0, 80) + '...';
    $('#le-resume').style.display = (LE.loopState === 'paused') ? 'block' : 'none';
    if (LE.local === 'dispatching') pill($('#le-simple'), 'le-run', 'Codex is running. Wait for result.');
    else if (LE.local === 'inserting') pill($('#le-simple'), 'le-run', 'Sending Codex result to GPT.');
    else if (ready) pill($('#le-simple'), 'le-ok', 'Ready: click Run current codex / start.');
    else if (LE.loopState === 'paused') pill($('#le-simple'), 'le-warn', 'Paused: click Continue, or type first task if no codex.');
    else pill($('#le-simple'), 'le-warn', 'No codex block yet. Type first task, then start.');
    const showSeed = !ready && LE.local !== 'dispatching' && LE.local !== 'inserting';
    $('#le-seed-label').style.display = showSeed ? 'block' : 'none';
    $('#le-seed').style.display = showSeed ? 'block' : 'none';
  }

  // ----------------------------------------------------------------------------
  // Startup
  // ----------------------------------------------------------------------------
  buildPanel();
  setInterval(tick, 1500);
  const mo = new MutationObserver(() => { /* nudge next tick when DOM changes */ });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  log('content.js ready', CONTENT_VERSION);
})();
