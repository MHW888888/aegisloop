/**
 * AegisLoop Bridge
 * ---------------------------------------------------------------------------
 * Local-only Node bridge for guarded ChatGPT -> Codex automation loops.
 *
 * Responsibilities:
 * - bind ChatGPT conversation ids to local Codex session ids;
 * - dispatch fenced codex prompts to `codex exec resume <sessionId> -`;
 * - enforce local research / safety gates before dispatch;
 * - deduplicate repeated payloads by content hash;
 * - serialize writes per workspace directory;
 * - keep per-turn JSONL audit logs;
 * - expose a tiny localhost API for the Chrome extension.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'state.json');
const LOG_DIR = path.join(ROOT, 'logs');

fs.mkdirSync(LOG_DIR, { recursive: true });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function loadConfig() {
  const config = readJson(CONFIG_PATH);
  config.runtimeRoot = config.runtimeRoot || path.join(ROOT, 'runs');
  config.denylistCompiled = (config.denylist || []).map(rule => ({
    name: rule.name,
    re: new RegExp(rule.pattern, rule.flags || 'i'),
  }));
  return config;
}

let CONFIG = loadConfig();
const PORT = CONFIG.port || 17380;
const API_TOKEN = String(CONFIG.apiToken || '').trim();
const DEFAULT_ARM_TTL_MS = CONFIG.armTtlMs || 10 * 60 * 1000;
const DEFAULT_ARM_LOOP_MAX_DISPATCHES = CONFIG.armLoopMaxDispatches || 12;

function isApiAuthorized(request) {
  if (!API_TOKEN) return true;
  return request.headers['x-aegisloop-token'] === API_TOKEN;
}

function corsOrigin() {
  return CONFIG.corsAllowOrigin || 'https://chatgpt.com';
}

function safeSegment(value, fallback) {
  return String(value || fallback || 'default')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || fallback || 'default';
}

function isPathInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function buildCapsule(binding) {
  const raw = binding.capsule;
  if (!raw || raw.enabled === false) return null;

  const projectId = safeSegment(raw.projectId, 'default-project');
  const activeBranch = safeSegment(raw.activeBranch, 'main');
  const runId = safeSegment(raw.runId, 'run-' + safeSegment(binding.conversationId, 'conversation').slice(0, 8));
  const runtimeRoot = path.resolve(raw.runtimeRoot || CONFIG.runtimeRoot);
  const allowedWriteRoot = path.resolve(raw.allowedWriteRoot || path.join(runtimeRoot, 'runs', projectId, activeBranch, runId));

  return {
    enabled: true,
    projectId,
    activeBranch,
    branchMeaning: String(raw.branchMeaning || ''),
    runId,
    mode: raw.mode || 'readonly',
    runtimeRoot,
    allowedWriteRoot,
    stageNamespaceRequired: raw.stageNamespaceRequired !== false,
    forbiddenBranchContext: Array.isArray(raw.forbiddenBranchContext) ? raw.forbiddenBranchContext.map(String) : [],
  };
}

function defaultConversation(binding) {
  return {
    conversationId: binding.conversationId,
    codexSessionId: binding.codexSessionId,
    workspaceDir: binding.workspaceDir,
    fullAuto: binding.fullAuto !== false,
    conversationMode: binding.conversationMode || 'chat',
    loopState: binding.conversationMode === 'frozen' ? 'halted' : 'paused',
    pauseReason: binding.conversationMode === 'frozen' ? 'frozen' : 'chat_mode',
    armNonce: null,
    armExpiresAt: 0,
    armMaxDispatches: 0,
    armDispatches: 0,
    executedHashes: [],
    consecutiveFailures: 0,
    lastJobId: null,
    turn: 0,
    pendingResult: null,
    blockedPayload: null,
    activeDispatchHash: null,
    lastDispatchAt: 0,
    capsule: buildCapsule(binding),
    updatedAt: Date.now(),
  };
}

let STATE = { conversations: {} };

function loadState() {
  try {
    STATE = readJson(STATE_PATH);
    if (!STATE.conversations) STATE.conversations = {};
  } catch {
    STATE = { conversations: {} };
  }

  for (const binding of (CONFIG.bindings || [])) {
    const existing = STATE.conversations[binding.conversationId];
    if (!existing) {
      STATE.conversations[binding.conversationId] = defaultConversation(binding);
      continue;
    }
    existing.codexSessionId = binding.codexSessionId;
    existing.workspaceDir = binding.workspaceDir;
    existing.capsule = buildCapsule(binding);
    if (typeof binding.fullAuto === 'boolean') existing.fullAuto = binding.fullAuto;
    if (!existing.conversationMode) {
      existing.conversationMode = binding.conversationMode || 'chat';
      if (existing.conversationMode === 'chat') {
        existing.loopState = 'paused';
        existing.pauseReason = 'chat_mode';
      }
    }
    if (!Object.prototype.hasOwnProperty.call(existing, 'armNonce')) existing.armNonce = null;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armExpiresAt')) existing.armExpiresAt = 0;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armMaxDispatches')) existing.armMaxDispatches = 0;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armDispatches')) existing.armDispatches = 0;
  }
}

let saveTimer = null;
function saveState() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(STATE, null, 2));
    fs.renameSync(tmp, STATE_PATH);
  }, 120);
}

function getConversation(id) {
  return STATE.conversations[id];
}

function audit(conversationId, event) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    conversationId,
    ...event,
  }) + '\n';
  fs.appendFile(path.join(LOG_DIR, conversationId + '.jsonl'), line, () => {});
}

function notify(text) {
  const url = CONFIG.feishuWebhook;
  if (!url) return;

  try {
    const u = new URL(url);
    const body = JSON.stringify({
      msg_type: 'text',
      content: { text: '[AegisLoop] ' + text },
    });
    const lib = u.protocol === 'https:' ? require('https') : require('http');
    const req = lib.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch {}
}

function sanitizeForGate(prompt) {
  const boundaryLineRe = /(\u4e0d\u8981|\u4e0d\u5f97|\u7981\u6b62|\u4e0d\u5141\u8bb8|\u4e0d\u80fd|\u8bf7\u52ff|\u907f\u514d|\u52ff|\u522b|\u4fdd\u6301|\u9ed8\u8ba4\u4fdd\u6301|do not|don't|never|must keep|keep .*false|no .*unless)/i;
  return String(prompt)
    .split(/\r?\n/)
    .filter(line => !boundaryLineRe.test(line))
    .join('\n')
    .replace(/\b[\w/-]*(?:production_signal|approved_for_scoring|alpha_evidence|official_top20_generated|trading_advice_generated|BUY\/WATCH\/AVOID_changed)\b\s*(=|:)?\s*false\b/gi, '');
}

function gateCheck(prompt) {
  const gateText = sanitizeForGate(prompt);
  for (const rule of CONFIG.denylistCompiled) {
    if (rule.re.test(gateText)) return { ok: false, rule: rule.name };
  }
  return { ok: true };
}

function hashPayload(prompt) {
  const normalized = String(prompt).replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

function newArmNonce() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `aegis-${date}-${crypto.randomBytes(4).toString('hex')}`;
}

function armConversation(conversation, maxDispatches) {
  conversation.conversationMode = 'armed';
  conversation.loopState = 'running';
  conversation.pauseReason = null;
  conversation.armNonce = newArmNonce();
  conversation.armExpiresAt = Date.now() + DEFAULT_ARM_TTL_MS;
  conversation.armMaxDispatches = maxDispatches;
  conversation.armDispatches = 0;
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, {
    type: 'mode_arm',
    armNonce: conversation.armNonce,
    armExpiresAt: conversation.armExpiresAt,
    armMaxDispatches: conversation.armMaxDispatches,
  });
  return conversation.armNonce;
}

function setChatMode(conversation, reason) {
  conversation.conversationMode = 'chat';
  conversation.loopState = 'paused';
  conversation.pauseReason = reason || 'chat_mode';
  conversation.armNonce = null;
  conversation.armExpiresAt = 0;
  conversation.armMaxDispatches = 0;
  conversation.armDispatches = 0;
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, { type: 'mode_chat', reason: conversation.pauseReason });
}

function setFrozenMode(conversation) {
  conversation.conversationMode = 'frozen';
  conversation.loopState = 'halted';
  conversation.pauseReason = 'frozen';
  conversation.armNonce = null;
  conversation.armExpiresAt = 0;
  conversation.armMaxDispatches = 0;
  conversation.armDispatches = 0;
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, { type: 'mode_frozen' });
}

function remainingDispatches(conversation) {
  return Math.max(0, (conversation.armMaxDispatches || 0) - (conversation.armDispatches || 0));
}

function ensureCapsuleRuntime(conversation) {
  const capsule = conversation.capsule;
  if (!capsule || !capsule.enabled) return null;
  fs.mkdirSync(capsule.allowedWriteRoot, { recursive: true });
  fs.mkdirSync(path.join(capsule.allowedWriteRoot, 'inbox'), { recursive: true });
  fs.mkdirSync(path.join(capsule.allowedWriteRoot, 'outbox'), { recursive: true });
  fs.mkdirSync(path.join(capsule.allowedWriteRoot, 'patches'), { recursive: true });
  fs.writeFileSync(path.join(capsule.allowedWriteRoot, 'capsule.json'), JSON.stringify({
    projectId: capsule.projectId,
    activeBranch: capsule.activeBranch,
    branchMeaning: capsule.branchMeaning,
    runId: capsule.runId,
    mode: capsule.mode,
    sourceDir: conversation.workspaceDir,
    allowedWriteRoot: capsule.allowedWriteRoot,
    forbiddenWritePaths: [
      conversation.workspaceDir,
      path.join(conversation.workspaceDir, 'outputs'),
    ],
    forbiddenBranchContext: capsule.forbiddenBranchContext,
    stageNamespaceRequired: capsule.stageNamespaceRequired,
    updatedAt: new Date().toISOString(),
  }, null, 2));
  return capsule.allowedWriteRoot;
}

function buildCapsuleHeader(conversation) {
  const capsule = conversation.capsule;
  if (!capsule || !capsule.enabled) return '';

  const forbidden = [
    conversation.workspaceDir,
    path.join(conversation.workspaceDir, 'outputs'),
  ].map(p => '- ' + p).join('\n');
  const forbiddenBranches = capsule.forbiddenBranchContext.length
    ? capsule.forbiddenBranchContext.map(v => '- ' + v).join('\n')
    : '- (none)';

  return [
    '[AegisLoop Run Capsule]',
    `project_id: ${capsule.projectId}`,
    `run_id: ${capsule.runId}`,
    `active_branch: ${capsule.activeBranch}`,
    `branch_meaning: ${capsule.branchMeaning || '(not provided)'}`,
    `mode: ${capsule.mode}`,
    `source_dir: ${conversation.workspaceDir}`,
    `allowed_write_root: ${capsule.allowedWriteRoot}`,
    'forbidden_write_paths:',
    forbidden,
    'forbidden_branch_context:',
    forbiddenBranches,
    `stage_namespace_required: ${capsule.stageNamespaceRequired ? 'true' : 'false'}`,
    '',
    'Rules:',
    '1. Do not write to source_dir or forbidden_write_paths.',
    '2. Write all artifacts only under allowed_write_root.',
    '3. Do not use files from forbidden_branch_context as accepted prerequisites.',
    '4. If a stage label is ambiguous, stop and ask for branch clarification.',
    '5. End with a machine-readable summary containing project_id, active_branch, stage_id, input_hash, output_files, and next_candidate.',
    '[/AegisLoop Run Capsule]',
    '',
  ].join('\n');
}

function decoratePrompt(conversation, prompt) {
  if (String(prompt).startsWith('[AegisLoop Run Capsule]')) return String(prompt);
  const header = buildCapsuleHeader(conversation);
  return header ? header + String(prompt) : String(prompt);
}

function capsuleCheck(conversation, prompt) {
  const capsule = conversation.capsule;
  if (!capsule || !capsule.enabled) return { ok: true };

  if (!isPathInside(capsule.allowedWriteRoot, capsule.runtimeRoot)) {
    return { ok: false, rule: 'capsule_write_root_outside_runtime' };
  }

  if (capsule.stageNamespaceRequired && capsule.activeBranch) {
    const text = String(prompt);
    const hasBranch = text.includes(capsule.activeBranch);
    const hasStage = /\b(?:V\d+(?:\.\d+)*[A-Z]?(?:\.\d+[A-Z]?)?|F\d+[A-Z]?)\b/i.test(text);
    if (hasStage && !hasBranch) {
      return { ok: false, rule: 'ambiguous_stage_without_active_branch' };
    }
  }

  for (const otherBranch of capsule.forbiddenBranchContext) {
    if (otherBranch && String(prompt).includes(otherBranch)) {
      return { ok: false, rule: 'forbidden_branch_context' };
    }
  }

  return { ok: true };
}

const workspaceLocks = new Map();

function withWorkspaceLock(dir, fn) {
  const key = path.normalize(dir).toLowerCase();
  const previous = workspaceLocks.get(key) || Promise.resolve();
  let release;
  const next = new Promise(resolve => { release = resolve; });
  const chain = previous.then(() => next);
  workspaceLocks.set(key, chain);

  return previous
    .then(() => fn())
    .finally(() => {
      release();
      if (workspaceLocks.get(key) === chain) workspaceLocks.delete(key);
    });
}

function lockDirForConversation(conversation) {
  if (conversation.capsule && conversation.capsule.enabled && conversation.capsule.mode === 'readonly') {
    return conversation.capsule.allowedWriteRoot;
  }
  return conversation.workspaceDir;
}

function classifyFailure(code, stderr, stdout) {
  const text = `${stderr || ''}\n${stdout || ''}`;
  if (/spawn|ENOENT|EPERM|EACCES|Failed to fetch|connection refused|ECONNRESET|ETIMEDOUT/i.test(text)) {
    return 'infra';
  }
  if (code === null || code === undefined) return 'infra';
  return 'task';
}

function runCodexOnce(conversation, prompt) {
  return new Promise(resolve => {
    const codex = CONFIG.codex;
    const args = [...codex.args, conversation.codexSessionId, codex.stdinFlag || '-'];
    const jobId = 'job_' + crypto.randomBytes(6).toString('hex');
    let stdout = '';
    let stderr = '';
    let child;
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    const timer = setTimeout(() => {
      try { if (child) child.kill('SIGKILL'); } catch {}
      finish({
        ok: false,
        jobId,
        code: 'timeout',
        stdout,
        stderr: stderr + '\nAegisLoop timeout',
        errorClass: 'infra',
      });
    }, codex.timeoutMs || 1800000);

    try {
      const cwd = conversation.capsule && conversation.capsule.enabled && conversation.capsule.mode === 'readonly'
        ? ensureCapsuleRuntime(conversation)
        : conversation.workspaceDir;
      child = spawn(codex.bin, args, {
        cwd,
        windowsHide: true,
        env: process.env,
      });
    } catch (error) {
      finish({
        ok: false,
        jobId,
        code: 'spawn_exception',
        stdout,
        stderr: String(error && error.stack || error),
        errorClass: 'infra',
      });
      return;
    }

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => {
      stderr += '\n' + String(error && error.stack || error);
    });
    child.on('close', code => {
      finish({
        ok: code === 0,
        jobId,
        code,
        stdout,
        stderr,
        errorClass: code === 0 ? null : classifyFailure(code, stderr, stdout),
      });
    });

    child.stdin.write(String(prompt));
    child.stdin.end();
  });
}

function extractFinal(stdout) {
  const trimmed = String(stdout || '').trim();
  if (!trimmed) return '(Codex returned no output)';
  const max = CONFIG.maxResultChars || 12000;
  return trimmed.length > max ? '...(truncated)\n' + trimmed.slice(-max) : trimmed;
}

function prepareDispatch(conversation, prompt, armNonce) {
  if (!['armed', 'review'].includes(conversation.conversationMode)) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'conversation_not_armed',
      conversationMode: conversation.conversationMode || 'chat',
    });
    return {
      status: 'blocked',
      rule: 'conversation_not_armed',
      conversationMode: conversation.conversationMode || 'chat',
    };
  }
  if (!conversation.armNonce || Date.now() > conversation.armExpiresAt) {
    setChatMode(conversation, 'arm_expired');
    return {
      status: 'blocked',
      rule: 'arm_expired',
      conversationMode: conversation.conversationMode,
    };
  }
  const providedNonce = String(armNonce || '');
  if (providedNonce !== conversation.armNonce && !String(prompt).includes(conversation.armNonce)) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'missing_or_stale_arm_nonce',
      conversationMode: conversation.conversationMode,
    });
    return {
      status: 'blocked',
      rule: 'missing_or_stale_arm_nonce',
      conversationMode: conversation.conversationMode,
    };
  }
  if (conversation.loopState !== 'running') {
    return {
      status: 'not_running',
      loopState: conversation.loopState,
      pauseReason: conversation.pauseReason,
    };
  }
  if (conversation.activeDispatchHash) {
    return { status: 'busy', hash: conversation.activeDispatchHash };
  }

  const capsuleGate = capsuleCheck(conversation, prompt);
  if (!capsuleGate.ok) {
    conversation.loopState = 'paused';
    conversation.pauseReason = 'gate:' + capsuleGate.rule;
    conversation.blockedPayload = {
      prompt,
      hash: hashPayload(prompt),
      rule: capsuleGate.rule,
    };
    conversation.updatedAt = Date.now();
    saveState();
    audit(conversation.conversationId, {
      type: 'capsule_blocked',
      rule: capsuleGate.rule,
      prompt,
      capsule: conversation.capsule,
    });
    return { status: 'blocked', rule: capsuleGate.rule };
  }

  const effectivePrompt = decoratePrompt(conversation, prompt);
  const hash = hashPayload(effectivePrompt);
  if (conversation.executedHashes.includes(hash)) {
    audit(conversation.conversationId, { type: 'duplicate_payload', hash });
    return { status: 'duplicate', hash };
  }

  const gate = gateCheck(effectivePrompt);
  if (!gate.ok) {
    const autoRules = Array.isArray(CONFIG.autoApproveGateRules)
      ? CONFIG.autoApproveGateRules
      : [];

    if (autoRules.includes(gate.rule)) {
      audit(conversation.conversationId, { type: 'gate_auto_approved', rule: gate.rule, hash });
    } else {
      conversation.loopState = 'paused';
      conversation.pauseReason = 'gate:' + gate.rule;
      conversation.blockedPayload = { prompt: effectivePrompt, hash, rule: gate.rule };
      conversation.updatedAt = Date.now();
      saveState();
      audit(conversation.conversationId, { type: 'gate_blocked', rule: gate.rule, hash, prompt: effectivePrompt });
      notify(`conversation ${conversation.conversationId.slice(0, 8)} blocked by gate ${gate.rule}`);
      return { status: 'blocked', rule: gate.rule, hash };
    }
  }

  conversation.executedHashes.push(hash);
  conversation.activeDispatchHash = hash;
  conversation.armDispatches = (conversation.armDispatches || 0) + 1;
  conversation.conversationMode = 'running';
  if (conversation.executedHashes.length > 500) {
    conversation.executedHashes.splice(0, conversation.executedHashes.length - 500);
  }
  saveState();
  ensureCapsuleRuntime(conversation);
  return { status: 'accepted', hash, prompt: effectivePrompt };
}

async function runDispatchAsync(conversation, prompt, hash) {
  try {
    const minGap = CONFIG.minIntervalMs || 0;
    const since = Date.now() - (conversation.lastDispatchAt || 0);
    if (minGap > 0 && since < minGap) {
      await new Promise(resolve => setTimeout(resolve, minGap - since));
    }

    conversation.turn += 1;
    conversation.lastDispatchAt = Date.now();
    const turn = conversation.turn;
    audit(conversation.conversationId, {
      type: 'dispatch',
      turn,
      hash,
      prompt,
      capsule: conversation.capsule || null,
    });

    const result = await withWorkspaceLock(lockDirForConversation(conversation), async () => {
      let first = await runCodexOnce(conversation, prompt);
      if (!first.ok && first.errorClass === 'infra') {
        audit(conversation.conversationId, { type: 'codex_retry_infra', turn, code: first.code });
        first = await runCodexOnce(conversation, prompt);
      }
      return first;
    });

    conversation.lastJobId = result.jobId;

    if (result.ok) {
      conversation.consecutiveFailures = 0;
      const finalMessage = extractFinal(result.stdout);
      conversation.pendingResult = {
        turn,
        jobId: result.jobId,
        ok: true,
        finalMessage,
        consumed: false,
        at: Date.now(),
      };
      audit(conversation.conversationId, {
        type: 'codex_done',
        turn,
        jobId: result.jobId,
        code: result.code,
        finalMessage,
      });
      return;
    }

    conversation.consecutiveFailures += 1;
    const failMessage = [
      `[Codex execution failed code=${result.code}]`,
      extractFinal(result.stdout),
      '--- stderr ---',
      String(result.stderr || '').slice(-2000),
    ].join('\n');

    conversation.pendingResult = {
      turn,
      jobId: result.jobId,
      ok: false,
      finalMessage: failMessage,
      consumed: false,
      at: Date.now(),
    };
    audit(conversation.conversationId, {
      type: 'codex_failed',
      turn,
      jobId: result.jobId,
      code: result.code,
      errorClass: result.errorClass,
    });

    const maxFailures = CONFIG.breaker?.maxConsecutiveFailures || 4;
    if (conversation.consecutiveFailures >= maxFailures) {
      conversation.loopState = 'paused';
      conversation.pauseReason = 'breaker:consecutive_failures';
      audit(conversation.conversationId, {
        type: 'breaker_tripped',
        consecutiveFailures: conversation.consecutiveFailures,
      });
      notify(`conversation ${conversation.conversationId.slice(0, 8)} paused by failure breaker`);
    }
  } finally {
    if (conversation.activeDispatchHash === hash) conversation.activeDispatchHash = null;
    conversation.updatedAt = Date.now();
    saveState();
  }
}

async function forceExecute(conversation, prompt) {
  const effectivePrompt = decoratePrompt(conversation, prompt);
  const hash = hashPayload(effectivePrompt);
  conversation.activeDispatchHash = hash;
  conversation.updatedAt = Date.now();
  saveState();

  conversation.turn += 1;
  const turn = conversation.turn;
  audit(conversation.conversationId, { type: 'forced_dispatch', turn, hash, capsule: conversation.capsule || null });

  const result = await withWorkspaceLock(lockDirForConversation(conversation), async () => {
    let first = await runCodexOnce(conversation, effectivePrompt);
    if (!first.ok && first.errorClass === 'infra') first = await runCodexOnce(conversation, effectivePrompt);
    return first;
  });

  conversation.lastJobId = result.jobId;
  if (!conversation.executedHashes.includes(hash)) conversation.executedHashes.push(hash);
  conversation.consecutiveFailures = result.ok ? 0 : conversation.consecutiveFailures + 1;
  conversation.pendingResult = {
    turn,
    jobId: result.jobId,
    ok: result.ok,
    finalMessage: result.ok
      ? extractFinal(result.stdout)
      : `[Codex execution failed code=${result.code}]\n${String(result.stderr || '').slice(-2000)}`,
    consumed: false,
    at: Date.now(),
  };
  if (conversation.activeDispatchHash === hash) conversation.activeDispatchHash = null;
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, {
    type: result.ok ? 'codex_done' : 'codex_failed',
    turn,
    jobId: result.jobId,
    code: result.code,
  });
}

function sendJson(response, code, object) {
  const body = JSON.stringify(object);
  response.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin(),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-AegisLoop-Token',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise(resolve => {
    let data = '';
    request.on('data', chunk => { data += chunk; });
    request.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return sendJson(response, 200, { ok: true });

  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);

  try {
    if (url.pathname === '/health' && request.method === 'GET') {
      return sendJson(response, 200, {
        ok: true,
        service: 'aegisloop-bridge',
        port: PORT,
        conversations: Object.keys(STATE.conversations).length,
      });
    }

    if (url.pathname.startsWith('/api/') && !isApiAuthorized(request)) {
      return sendJson(response, 401, {
        error: 'unauthorized',
        message: 'Missing or invalid X-AegisLoop-Token',
      });
    }

    if (url.pathname === '/api/conversations' && request.method === 'GET') {
      return sendJson(response, 200, {
        conversations: Object.values(STATE.conversations).map(c => ({
          conversationId: c.conversationId,
          codexSessionId: c.codexSessionId,
          workspaceDir: c.workspaceDir,
          fullAuto: c.fullAuto,
          conversationMode: c.conversationMode || 'chat',
          armNonce: c.armNonce || null,
          armExpiresAt: c.armExpiresAt || 0,
          armDispatches: c.armDispatches || 0,
          armMaxDispatches: c.armMaxDispatches || 0,
          loopState: c.loopState,
          pauseReason: c.pauseReason,
          turn: c.turn,
          consecutiveFailures: c.consecutiveFailures,
          lastJobId: c.lastJobId,
          activeDispatchHash: c.activeDispatchHash || null,
          hasPendingResult: !!(c.pendingResult && !c.pendingResult.consumed),
          blockedPayload: c.blockedPayload,
          capsule: c.capsule || null,
        })),
      });
    }

    if (url.pathname === '/api/register' && request.method === 'POST') {
      const body = await readBody(request);
      if (!body.conversationId) return sendJson(response, 400, { error: 'conversationId required' });

      let conversation = getConversation(body.conversationId);
      if (!conversation) {
        if (!body.codexSessionId || !body.workspaceDir) {
          return sendJson(response, 409, {
            error: 'unknown conversation; codexSessionId + workspaceDir required to bind',
          });
        }
        conversation = defaultConversation(body);
        STATE.conversations[body.conversationId] = conversation;
        audit(body.conversationId, {
          type: 'dynamic_bind',
          codexSessionId: body.codexSessionId,
          workspaceDir: body.workspaceDir,
        });
        saveState();
      }

      return sendJson(response, 200, {
        conversationId: conversation.conversationId,
        codexSessionId: conversation.codexSessionId,
        workspaceDir: conversation.workspaceDir,
        capsule: conversation.capsule || null,
        fullAuto: conversation.fullAuto,
        conversationMode: conversation.conversationMode || 'chat',
        armNonce: conversation.armNonce || null,
        armExpiresAt: conversation.armExpiresAt || 0,
        armDispatches: conversation.armDispatches || 0,
        armMaxDispatches: conversation.armMaxDispatches || 0,
        loopState: conversation.loopState,
        contractVersion: CONFIG.contractVersion,
      });
    }

    if (url.pathname === '/api/dispatch' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
        return sendJson(response, 400, { error: 'prompt required' });
      }

      const prepared = prepareDispatch(conversation, body.prompt, body.armNonce);
      if (prepared.status === 'accepted') {
        runDispatchAsync(conversation, prepared.prompt, prepared.hash);
      }
      return sendJson(response, 200, prepared);
    }

    if (url.pathname === '/api/mode' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });

      if (body.action === 'chat') {
        setChatMode(conversation, body.reason || 'chat_mode');
        return sendJson(response, 200, {
          ok: true,
          conversationMode: conversation.conversationMode,
          loopState: conversation.loopState,
          pauseReason: conversation.pauseReason,
        });
      }

      if (body.action === 'freeze') {
        setFrozenMode(conversation);
        return sendJson(response, 200, {
          ok: true,
          conversationMode: conversation.conversationMode,
          loopState: conversation.loopState,
          pauseReason: conversation.pauseReason,
        });
      }

      if (body.action === 'arm_once' || body.action === 'arm_loop') {
        const maxDispatches = body.action === 'arm_once'
          ? 1
          : Math.max(1, Number(body.maxDispatches || DEFAULT_ARM_LOOP_MAX_DISPATCHES));
        const nonce = armConversation(conversation, maxDispatches);
        return sendJson(response, 200, {
          ok: true,
          conversationMode: conversation.conversationMode,
          loopState: conversation.loopState,
          armNonce: nonce,
          armExpiresAt: conversation.armExpiresAt,
          armDispatches: conversation.armDispatches,
          armMaxDispatches: conversation.armMaxDispatches,
        });
      }

      return sendJson(response, 400, { error: 'unknown mode action' });
    }

    if (url.pathname === '/api/result' && request.method === 'GET') {
      const conversation = getConversation(url.searchParams.get('conversationId'));
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });

      if (conversation.pendingResult && !conversation.pendingResult.consumed) {
        const result = conversation.pendingResult;
        return sendJson(response, 200, {
          hasResult: true,
          result,
          loopState: conversation.loopState,
        });
      }

      return sendJson(response, 200, {
        hasResult: false,
        loopState: conversation.loopState,
        pauseReason: conversation.pauseReason,
      });
    }

    if (url.pathname === '/api/result/ack' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      if (!conversation.pendingResult || conversation.pendingResult.consumed) {
        return sendJson(response, 409, { error: 'no pending result' });
      }
      if (body.jobId && body.jobId !== conversation.pendingResult.jobId) {
        return sendJson(response, 409, {
          error: 'jobId mismatch',
          pendingJobId: conversation.pendingResult.jobId,
        });
      }

      conversation.pendingResult.consumed = true;
      if (remainingDispatches(conversation) > 0 && conversation.armNonce && Date.now() <= conversation.armExpiresAt) {
        conversation.conversationMode = 'review';
        conversation.loopState = 'running';
        conversation.pauseReason = null;
      } else {
        conversation.conversationMode = 'chat';
        conversation.loopState = 'paused';
        conversation.pauseReason = 'chat_mode';
        conversation.armNonce = null;
        conversation.armExpiresAt = 0;
        conversation.armMaxDispatches = 0;
        conversation.armDispatches = 0;
      }
      conversation.updatedAt = Date.now();
      saveState();
      audit(conversation.conversationId, {
        type: 'result_ack',
        jobId: conversation.pendingResult.jobId,
        turn: conversation.pendingResult.turn,
        conversationMode: conversation.conversationMode,
      });
      return sendJson(response, 200, { ok: true, hasPendingResult: false });
    }

    if (url.pathname === '/api/result/nack' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      if (!conversation.pendingResult || conversation.pendingResult.consumed) {
        return sendJson(response, 409, { error: 'no pending result' });
      }
      if (body.jobId && body.jobId !== conversation.pendingResult.jobId) {
        return sendJson(response, 409, {
          error: 'jobId mismatch',
          pendingJobId: conversation.pendingResult.jobId,
        });
      }

      conversation.loopState = 'paused';
      conversation.pauseReason = body.reason || 'result_not_acknowledged';
      conversation.updatedAt = Date.now();
      saveState();
      audit(conversation.conversationId, {
        type: 'result_nack',
        jobId: conversation.pendingResult.jobId,
        turn: conversation.pendingResult.turn,
        reason: conversation.pauseReason,
      });
      return sendJson(response, 200, {
        ok: true,
        hasPendingResult: true,
        loopState: conversation.loopState,
        pauseReason: conversation.pauseReason,
      });
    }

    if (url.pathname === '/api/control' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });

      if (body.action === 'pause') {
        conversation.loopState = 'paused';
        conversation.pauseReason = body.reason || 'manual';
        conversation.updatedAt = Date.now();
        saveState();
        audit(conversation.conversationId, { type: 'manual_pause', reason: conversation.pauseReason });
        return sendJson(response, 200, { ok: true, loopState: conversation.loopState });
      }

      if (body.action === 'resume') {
        conversation.loopState = 'running';
        conversation.pauseReason = null;
        conversation.consecutiveFailures = 0;
        conversation.updatedAt = Date.now();
        saveState();
        audit(conversation.conversationId, { type: 'manual_resume' });
        return sendJson(response, 200, { ok: true, loopState: conversation.loopState });
      }

      if (body.action === 'stop') {
        if (!body.confirmed) return sendJson(response, 400, { error: 'stop requires confirmed:true' });
        conversation.loopState = 'halted';
        conversation.pauseReason = 'manual_stop';
        conversation.updatedAt = Date.now();
        saveState();
        audit(conversation.conversationId, { type: 'manual_stop_confirmed' });
        notify(`conversation ${conversation.conversationId.slice(0, 8)} was manually stopped`);
        return sendJson(response, 200, { ok: true, loopState: conversation.loopState });
      }

      if (body.action === 'approve') {
        if (!conversation.blockedPayload) return sendJson(response, 400, { error: 'no blocked payload' });
        const blocked = conversation.blockedPayload;
        conversation.blockedPayload = null;
        conversation.loopState = 'running';
        conversation.pauseReason = null;
        audit(conversation.conversationId, {
          type: 'gate_override_approved',
          rule: blocked.rule,
          hash: blocked.hash,
        });
        forceExecute(conversation, blocked.prompt);
        saveState();
        return sendJson(response, 200, {
          ok: true,
          loopState: conversation.loopState,
          note: 'approved and executing',
        });
      }

      if (body.action === 'skip') {
        if (conversation.blockedPayload && !conversation.executedHashes.includes(conversation.blockedPayload.hash)) {
          conversation.executedHashes.push(conversation.blockedPayload.hash);
        }
        conversation.blockedPayload = null;
        conversation.loopState = 'running';
        conversation.pauseReason = null;
        conversation.updatedAt = Date.now();
        saveState();
        audit(conversation.conversationId, { type: 'gate_skipped' });
        return sendJson(response, 200, { ok: true, loopState: conversation.loopState });
      }

      return sendJson(response, 400, { error: 'unknown action' });
    }

    return sendJson(response, 404, { error: 'not found', path: url.pathname });
  } catch (error) {
    audit('_server', {
      type: 'handler_error',
      path: url.pathname,
      error: String(error && error.stack || error),
    });
    return sendJson(response, 500, { error: String(error) });
  }
});

loadState();

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[bridge] port ${PORT} is already in use; keeping the existing instance`);
    process.exit(1);
  }
  console.error('[bridge] server error', error);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] AegisLoop listening on http://127.0.0.1:${PORT} (contract ${CONFIG.contractVersion})`);
  console.log(`[bridge] conversations: ${Object.keys(STATE.conversations).join(', ') || '(none)'}`);
});

process.on('uncaughtException', error => {
  audit('_server', { type: 'uncaught', error: String(error && error.stack || error) });
});

process.on('unhandledRejection', error => {
  audit('_server', { type: 'unhandled_rejection', error: String(error) });
});
