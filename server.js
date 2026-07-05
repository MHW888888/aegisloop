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
const { validateConfig } = require('./config-validation');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'state.json');
const STATE_BAK_PATH = STATE_PATH + '.bak';
const LOG_DIR = path.join(ROOT, 'logs');

fs.mkdirSync(LOG_DIR, { recursive: true });

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function loadConfig() {
  const config = readJson(CONFIG_PATH);
  validateConfig(config);
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
const ALLOW_NO_TOKEN = process.env.AEGISLOOP_ALLOW_NO_TOKEN === '1';
const DEFAULT_ARM_TTL_MS = CONFIG.armTtlMs || 10 * 60 * 1000;
const DEFAULT_ARM_LOOP_MAX_DISPATCHES = CONFIG.armLoopMaxDispatches || 12;
const DEFAULT_LEADER_LEASE_MS = CONFIG.leaderLeaseMs || 15000;
const MAX_BODY_BYTES = CONFIG.maxBodyBytes || 1024 * 1024;
const BRIEFING_TEMPLATE_VERSION = CONFIG.briefingTemplateVersion || 'briefing-1';
const BRIEFING_TEMPLATE_DIR = path.join(ROOT, 'templates', 'briefings');
const BRIEFING_FILES = [
  'GPT_THREAD_BRIEF.md',
  'CODEX_EXECUTION_BRIEF.md',
  'RESEARCH_RULES.md',
  'FROZEN_BRANCHES.md',
  'CURRENT_OBJECTIVE.md',
];

function isApiAuthorized(request) {
  if (!API_TOKEN) return ALLOW_NO_TOKEN;
  return request.headers['x-aegisloop-token'] === API_TOKEN;
}

function configuredAllowedOrigins() {
  const origins = new Set(['https://chatgpt.com', 'https://chat.openai.com']);
  if (CONFIG.corsAllowOrigin) origins.add(String(CONFIG.corsAllowOrigin));
  for (const origin of (CONFIG.allowedOrigins || [])) origins.add(String(origin));
  return origins;
}

function isApiOriginAllowed(request) {
  const origin = String(request.headers.origin || '').trim();
  if (!origin) return true;
  if (origin.startsWith('chrome-extension://')) return true;
  return configuredAllowedOrigins().has(origin);
}

function corsOrigin(origin) {
  if (origin && (origin.startsWith('chrome-extension://') || configuredAllowedOrigins().has(origin))) return origin;
  return CONFIG.corsAllowOrigin || 'https://chatgpt.com';
}

function safeSegment(value, fallback) {
  const raw = String(value || fallback || 'default').normalize('NFKC').trim();
  let out = '';
  for (const ch of raw) {
    if (/^[a-z0-9._-]$/i.test(ch)) out += ch;
    else if (/\s/.test(ch) || /[<>:"/\\|?*\x00-\x1F]/.test(ch)) out += '-';
    else out += ch;
  }
  out = out
    .replace(/-+/g, '-')
    .replace(/^[. -]+|[. -]+$/g, '')
    .slice(0, 96);
  if (!out) out = fallback || 'default';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out += '-safe';
  return out;
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
    armId: null,
    turnNonce: null,
    armNonce: null, // Legacy alias for the current visible turn token.
    usedTurnTokens: [],
    armExpiresAt: 0,
    armMaxDispatches: 0,
    armDispatches: 0,
    attemptedHashes: [],
    ackedHashes: [],
    failedHashes: [],
    executedHashes: [],
    ackedResultIds: [],
    leaderLease: null,
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

function rememberHash(conversation, field, hash, limit = 500) {
  if (!hash) return;
  if (!Array.isArray(conversation[field])) conversation[field] = [];
  if (!conversation[field].includes(hash)) conversation[field].push(hash);
  if (conversation[field].length > limit) {
    conversation[field].splice(0, conversation[field].length - limit);
  }
}

function ensureHashBuckets(conversation) {
  if (!conversation) return;
  if (!Array.isArray(conversation.attemptedHashes)) conversation.attemptedHashes = [];
  if (!Array.isArray(conversation.failedHashes)) conversation.failedHashes = [];
  if (!Array.isArray(conversation.ackedResultIds)) conversation.ackedResultIds = [];
  if (!Array.isArray(conversation.usedTurnTokens)) conversation.usedTurnTokens = [];
  if (!Array.isArray(conversation.ackedHashes)) {
    conversation.ackedHashes = Array.isArray(conversation.executedHashes)
      ? [...conversation.executedHashes]
      : [];
  }
  if (!Array.isArray(conversation.executedHashes)) conversation.executedHashes = [...conversation.ackedHashes];
}

function hasUnconsumedPendingResult(conversation) {
  return !!(conversation && conversation.pendingResult && !conversation.pendingResult.consumed);
}

function normalizeClientId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(id) ? id : '';
}

function ensureLeaderLease(conversation, clientId, now = Date.now()) {
  const normalized = normalizeClientId(clientId);
  if (!normalized) {
    return { ok: false, status: 'leader_required', message: 'clientId required' };
  }
  const current = conversation.leaderLease;
  if (!current || !current.clientId || Number(current.expiresAt || 0) <= now || current.clientId === normalized) {
    conversation.leaderLease = {
      clientId: normalized,
      expiresAt: now + DEFAULT_LEADER_LEASE_MS,
      updatedAt: now,
    };
    conversation.updatedAt = now;
    saveState();
    return { ok: true, leaderLease: conversation.leaderLease };
  }
  return {
    ok: false,
    status: 'leader_conflict',
    leaderClientId: current.clientId,
    leaderExpiresAt: current.expiresAt,
  };
}

function requireLeader(conversation, clientId) {
  const lease = ensureLeaderLease(conversation, clientId);
  if (lease.ok) return null;
  return lease;
}

function resultIdFor(result) {
  const hash = crypto.createHash('sha256')
    .update([
      result.jobId || '',
      String(result.turn || ''),
      result.hash || '',
      result.ok ? 'ok' : 'fail',
      String(result.finalMessage || ''),
    ].join('\0'))
    .digest('hex')
    .slice(0, 16);
  return 'res_' + hash;
}

function ensurePendingResultId(conversation) {
  if (!conversation || !conversation.pendingResult) return null;
  if (!conversation.pendingResult.resultId) {
    conversation.pendingResult.resultId = resultIdFor(conversation.pendingResult);
  }
  return conversation.pendingResult.resultId;
}

function loadState() {
  try {
    STATE = readJson(STATE_PATH);
    if (!STATE.conversations) STATE.conversations = {};
  } catch (stateError) {
    if (fs.existsSync(STATE_PATH)) {
      const bad = STATE_PATH + '.bad.' + Date.now();
      try { fs.renameSync(STATE_PATH, bad); } catch {}
      console.warn(`[bridge] state.json was invalid and moved aside: ${path.basename(bad)}`);
    }
    try {
      STATE = readJson(STATE_BAK_PATH);
      if (!STATE.conversations) STATE.conversations = {};
      console.warn('[bridge] restored state from state.json.bak');
    } catch {
      STATE = { conversations: {} };
    }
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
    if (!Object.prototype.hasOwnProperty.call(existing, 'armId')) existing.armId = existing.armNonce ? newArmId() : null;
    if (!Object.prototype.hasOwnProperty.call(existing, 'turnNonce')) existing.turnNonce = existing.armNonce || null;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armNonce')) existing.armNonce = existing.turnNonce || null;
    if (!Object.prototype.hasOwnProperty.call(existing, 'usedTurnTokens')) existing.usedTurnTokens = [];
    if (existing.turnNonce && !existing.armNonce) existing.armNonce = existing.turnNonce;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armExpiresAt')) existing.armExpiresAt = 0;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armMaxDispatches')) existing.armMaxDispatches = 0;
    if (!Object.prototype.hasOwnProperty.call(existing, 'armDispatches')) existing.armDispatches = 0;
    if (!Object.prototype.hasOwnProperty.call(existing, 'leaderLease')) existing.leaderLease = null;
    ensureHashBuckets(existing);
    ensurePendingResultId(existing);
  }
}

let saveTimer = null;
function saveState() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_PATH + '.tmp';
    if (fs.existsSync(STATE_PATH)) {
      try { fs.copyFileSync(STATE_PATH, STATE_BAK_PATH); } catch {}
    }
    fs.writeFileSync(tmp, JSON.stringify(STATE, null, 2));
    fs.renameSync(tmp, STATE_PATH);
  }, 120);
}

function getConversation(id) {
  return STATE.conversations[id];
}

function redactString(text) {
  return String(text || '')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[redacted_github_pat]')
    .replace(/\b(api[_-]?key|token|authorization)\b\s*[:=]\s*["']?[^"'\s]+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

function summarizeRawText(text) {
  const raw = String(text || '');
  return {
    redacted: true,
    length: raw.length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16),
  };
}

function sanitizeAudit(value, key) {
  if (!CONFIG.debugAuditRaw && ['prompt', 'finalMessage'].includes(key)) {
    return summarizeRawText(value);
  }
  if (/^(armId|armNonce|turnNonce)$/i.test(String(key || ''))) return tokenMeta(value);
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(item => sanitizeAudit(item, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeAudit(childValue, childKey);
    }
    return out;
  }
  return value;
}

function audit(conversationId, event) {
  const safeEvent = sanitizeAudit(event || {}, '');
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    conversationId,
    ...safeEvent,
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

function newArmId() {
  return `arm_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function newTurnNonce() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `aegis-${date}-${crypto.randomBytes(4).toString('hex')}`;
}

function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function tokenMeta(value) {
  const raw = String(value || '');
  return {
    redacted: true,
    hash: tokenHash(raw),
    length: raw.length,
  };
}

function currentArmPayload(conversation) {
  return {
    armId: conversation.armId || null,
    turnNonce: conversation.turnNonce || null,
    armNonce: conversation.turnNonce || conversation.armNonce || null,
    armExpiresAt: conversation.armExpiresAt || 0,
    armDispatches: conversation.armDispatches || 0,
    armMaxDispatches: conversation.armMaxDispatches || 0,
  };
}

function clearArm(conversation) {
  conversation.armId = null;
  conversation.turnNonce = null;
  conversation.armNonce = null;
  conversation.usedTurnTokens = [];
  conversation.armExpiresAt = 0;
  conversation.armMaxDispatches = 0;
  conversation.armDispatches = 0;
}

function rotateTurnNonce(conversation) {
  const next = newTurnNonce();
  conversation.turnNonce = next;
  conversation.armNonce = next;
  return next;
}

function markTurnNonceUsed(conversation, turnNonce) {
  rememberHash(conversation, 'usedTurnTokens', tokenHash(turnNonce), 1000);
}

function isTurnNonceUsed(conversation, turnNonce) {
  const h = tokenHash(turnNonce);
  return Array.isArray(conversation.usedTurnTokens) && conversation.usedTurnTokens.includes(h);
}

function armConversation(conversation, maxDispatches) {
  conversation.conversationMode = 'armed';
  conversation.loopState = 'running';
  conversation.pauseReason = null;
  conversation.armId = newArmId();
  rotateTurnNonce(conversation);
  conversation.usedTurnTokens = [];
  conversation.armExpiresAt = Date.now() + DEFAULT_ARM_TTL_MS;
  conversation.armMaxDispatches = maxDispatches;
  conversation.armDispatches = 0;
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, {
    type: 'mode_arm',
    armId: conversation.armId,
    turnNonce: conversation.turnNonce,
    armExpiresAt: conversation.armExpiresAt,
    armMaxDispatches: conversation.armMaxDispatches,
  });
  return currentArmPayload(conversation);
}

function setChatMode(conversation, reason) {
  conversation.conversationMode = 'chat';
  conversation.loopState = 'paused';
  conversation.pauseReason = reason || 'chat_mode';
  clearArm(conversation);
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, { type: 'mode_chat', reason: conversation.pauseReason });
}

function setFrozenMode(conversation) {
  conversation.conversationMode = 'frozen';
  conversation.loopState = 'halted';
  conversation.pauseReason = 'frozen';
  clearArm(conversation);
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

function briefingHash(conversation, objective) {
  const capsule = conversation.capsule || {};
  return crypto.createHash('sha256').update(JSON.stringify({
    templateVersion: BRIEFING_TEMPLATE_VERSION,
    projectId: capsule.projectId || '',
    activeBranch: capsule.activeBranch || '',
    runId: capsule.runId || '',
    objective: String(objective || '').trim(),
  })).digest('hex').slice(0, 16);
}

function briefingPaths(conversation) {
  const root = ensureCapsuleRuntime(conversation);
  if (!root) return null;
  return {
    root,
    inbox: path.join(root, 'inbox'),
    meta: path.join(root, 'inbox', 'briefing.json'),
  };
}

function renderBriefingTemplate(name, values) {
  const file = path.join(BRIEFING_TEMPLATE_DIR, name);
  let text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  for (const [key, value] of Object.entries(values)) {
    text = text.split(key).join(String(value));
  }
  return text;
}

function briefingValues(conversation, body) {
  const capsule = conversation.capsule;
  const frozen = capsule.forbiddenBranchContext.length
    ? capsule.forbiddenBranchContext.join(', ')
    : '(none)';
  const objective = String(body.objective || '').trim();
  const outputRoot = path.join(capsule.allowedWriteRoot, 'outbox');
  return {
    PROJECT_ID: capsule.projectId,
    ACTIVE_BRANCH: capsule.activeBranch,
    CURRENT_TASK: objective,
    CURRENT_OBJECTIVE: objective,
    FROZEN_BRANCH_OR_CONTEXT: frozen,
    STATE_FACT_1: 'Run Capsule is enabled for ' + capsule.projectId + ' / ' + capsule.activeBranch + '.',
    STATE_FACT_2: 'Codex must read capsule.json and inbox briefing files before execution.',
    STATE_FACT_3: 'All artifacts must stay under allowed_write_root.',
    INPUT_PATH_1: conversation.workspaceDir,
    INPUT_PATH_2: path.join(capsule.allowedWriteRoot, 'inbox'),
    OUTPUT_PATH_UNDER_ALLOWED_WRITE_ROOT: outputRoot,
    required_output_1: 'result.md',
    required_output_2: 'audit.csv',
    CRITERION_1: 'Do not modify source_dir.',
    CRITERION_2: 'Write artifacts only under allowed_write_root.',
    CRITERION_3: 'Follow RESEARCH_RULES.md.',
    COMMAND_1: 'node --version',
    COMMAND_2: 'dir',
    COMMAND_3: 'echo Add project-specific validation commands here.',
  };
}

function materializeBriefing(conversation, body) {
  const capsule = conversation.capsule;
  if (!capsule || !capsule.enabled) {
    return { ok: false, error: 'capsule_missing' };
  }
  const objective = String(body.objective || '').trim();
  if (!objective) return { ok: false, error: 'objective_required' };

  const paths = briefingPaths(conversation);
  const values = briefingValues(conversation, { ...body, objective });
  const files = [];
  for (const name of BRIEFING_FILES) {
    const rendered = renderBriefingTemplate(name, values);
    fs.writeFileSync(path.join(paths.inbox, name), rendered, 'utf8');
    files.push(name);
  }

  const meta = {
    templateVersion: BRIEFING_TEMPLATE_VERSION,
    conversationId: conversation.conversationId,
    projectId: capsule.projectId,
    activeBranch: capsule.activeBranch,
    runId: capsule.runId,
    objective,
    sourceDir: conversation.workspaceDir,
    allowedWriteRoot: capsule.allowedWriteRoot,
    briefingHash: briefingHash(conversation, objective),
    generatedAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(paths.meta, JSON.stringify(meta, null, 2), 'utf8');
  audit(conversation.conversationId, { type: 'briefing_materialized', meta });
  return {
    ok: true,
    briefing: getBriefingStatus(conversation),
    gptBrief: fs.readFileSync(path.join(paths.inbox, 'GPT_THREAD_BRIEF.md'), 'utf8'),
  };
}

function getBriefingStatus(conversation) {
  const capsule = conversation.capsule;
  if (!capsule || !capsule.enabled) {
    return { status: 'unavailable', reason: 'capsule_missing' };
  }
  const paths = briefingPaths(conversation);
  const required = [...BRIEFING_FILES, 'briefing.json'];
  const missing = required.filter(name => !fs.existsSync(path.join(paths.inbox, name)));
  if (missing.length) {
    return {
      status: 'missing',
      reason: 'briefing_missing',
      missing,
      root: paths.root,
      inbox: paths.inbox,
    };
  }

  try {
    const meta = readJson(paths.meta);
    const expectedHash = briefingHash(conversation, meta.objective || '');
    const stale = meta.templateVersion !== BRIEFING_TEMPLATE_VERSION
      || meta.projectId !== capsule.projectId
      || meta.activeBranch !== capsule.activeBranch
      || meta.runId !== capsule.runId
      || meta.sourceDir !== conversation.workspaceDir
      || meta.allowedWriteRoot !== capsule.allowedWriteRoot
      || meta.briefingHash !== expectedHash;
    return {
      status: stale ? 'stale' : 'ready',
      reason: stale ? 'briefing_stale' : null,
      root: paths.root,
      inbox: paths.inbox,
      meta,
    };
  } catch (error) {
    return {
      status: 'stale',
      reason: 'briefing_meta_invalid',
      root: paths.root,
      inbox: paths.inbox,
      error: String(error && error.message || error),
    };
  }
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

function createOutputBuffer(limit) {
  const max = Math.max(4096, Number(limit || 0) || 1024 * 1024);
  let tail = '';
  let totalChars = 0;
  let truncated = false;

  return {
    append(chunk) {
      const text = chunk == null ? '' : chunk.toString();
      totalChars += text.length;
      tail += text;
      if (tail.length > max) {
        truncated = true;
        tail = tail.slice(-max);
      }
    },
    text() {
      return truncated ? `...(output truncated; kept last ${max} chars)\n${tail}` : tail;
    },
    meta() {
      return {
        totalChars,
        keptChars: tail.length,
        truncated,
      };
    },
  };
}

function killProcessTree(child, conversation, jobId) {
  if (!child || !child.pid) return;
  const pid = child.pid;
  const platform = process.platform;
  audit(conversation.conversationId, {
    type: 'codex_timeout_kill_tree',
    jobId,
    pid,
    platform,
  });

  if (platform === 'win32') {
    try {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      try { child.kill('SIGKILL'); } catch {}
    }
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
    setTimeout(() => {
      try { process.kill(-pid, 'SIGKILL'); } catch {}
    }, 1500).unref();
  } catch {
    try { child.kill('SIGKILL'); } catch {}
  }
}

function runCodexOnce(conversation, prompt) {
  return new Promise(resolve => {
    const codex = CONFIG.codex;
    const args = [...codex.args, conversation.codexSessionId, codex.stdinFlag || '-'];
    const jobId = 'job_' + crypto.randomBytes(6).toString('hex');
    const bufferLimit = CONFIG.outputBufferChars || 1024 * 1024;
    const stdout = createOutputBuffer(bufferLimit);
    const stderr = createOutputBuffer(bufferLimit);
    let child;
    let settled = false;

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    const timer = setTimeout(() => {
      killProcessTree(child, conversation, jobId);
      finish({
        ok: false,
        jobId,
        code: 'timeout',
        stdout: stdout.text(),
        stderr: stderr.text() + '\nAegisLoop timeout',
        stdoutMeta: stdout.meta(),
        stderrMeta: stderr.meta(),
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
        detached: process.platform !== 'win32',
        env: process.env,
      });
    } catch (error) {
      finish({
        ok: false,
        jobId,
        code: 'spawn_exception',
        stdout: stdout.text(),
        stderr: String(error && error.stack || error),
        stdoutMeta: stdout.meta(),
        stderrMeta: stderr.meta(),
        errorClass: 'infra',
      });
      return;
    }

    child.stdout.on('data', chunk => { stdout.append(chunk); });
    child.stderr.on('data', chunk => { stderr.append(chunk); });
    child.on('error', error => {
      stderr.append('\n' + String(error && error.stack || error));
    });
    child.on('close', code => {
      const stdoutText = stdout.text();
      const stderrText = stderr.text();
      finish({
        ok: code === 0,
        jobId,
        code,
        stdout: stdoutText,
        stderr: stderrText,
        stdoutMeta: stdout.meta(),
        stderrMeta: stderr.meta(),
        errorClass: code === 0 ? null : classifyFailure(code, stderrText, stdoutText),
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

function prepareDispatch(conversation, prompt, auth) {
  ensureHashBuckets(conversation);
  const dispatchAuth = auth || {};
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
  if (!conversation.armId || !conversation.turnNonce || Date.now() > conversation.armExpiresAt) {
    setChatMode(conversation, 'turn_nonce_expired');
    return {
      status: 'blocked',
      rule: 'turn_nonce_expired',
      conversationMode: conversation.conversationMode,
    };
  }
  const providedArmId = String(dispatchAuth.armId || '');
  if (providedArmId !== conversation.armId) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'arm_id_mismatch',
      conversationMode: conversation.conversationMode,
    });
    return {
      status: 'blocked',
      rule: 'arm_id_mismatch',
      conversationMode: conversation.conversationMode,
    };
  }
  const providedTurnNonce = String(dispatchAuth.turnNonce || '');
  if (!providedTurnNonce) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'missing_turn_nonce',
      conversationMode: conversation.conversationMode,
    });
    return {
      status: 'blocked',
      rule: 'missing_turn_nonce',
      conversationMode: conversation.conversationMode,
    };
  }
  if (isTurnNonceUsed(conversation, providedTurnNonce)) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'nonce_replay_blocked',
      turnNonce: providedTurnNonce,
      conversationMode: conversation.conversationMode,
    });
    return {
      status: 'blocked',
      rule: 'nonce_replay_blocked',
      conversationMode: conversation.conversationMode,
    };
  }
  if (providedTurnNonce !== conversation.turnNonce) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'turn_nonce_mismatch',
      turnNonce: providedTurnNonce,
      conversationMode: conversation.conversationMode,
    });
    return {
      status: 'blocked',
      rule: 'turn_nonce_mismatch',
      conversationMode: conversation.conversationMode,
    };
  }
  if (!dispatchAuth.assistantMessageSig || !dispatchAuth.codeBlockHash) {
    audit(conversation.conversationId, {
      type: 'mode_blocked',
      rule: 'dispatch_metadata_missing',
      conversationMode: conversation.conversationMode,
    });
    return {
      status: 'blocked',
      rule: 'dispatch_metadata_missing',
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
  if (hasUnconsumedPendingResult(conversation)) {
    audit(conversation.conversationId, {
      type: 'pending_result_blocked_dispatch',
      jobId: conversation.pendingResult.jobId,
      turn: conversation.pendingResult.turn,
    });
    return {
      status: 'pending_result_exists',
      jobId: conversation.pendingResult.jobId,
      turn: conversation.pendingResult.turn,
    };
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
  if (conversation.ackedHashes.includes(hash)) {
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

  rememberHash(conversation, 'attemptedHashes', hash);
  const usedTurnTokenHash = tokenHash(providedTurnNonce);
  markTurnNonceUsed(conversation, providedTurnNonce);
  conversation.activeDispatchHash = hash;
  conversation.armDispatches = (conversation.armDispatches || 0) + 1;
  if (remainingDispatches(conversation) > 0 && Date.now() <= conversation.armExpiresAt) {
    rotateTurnNonce(conversation);
  } else {
    conversation.turnNonce = null;
    conversation.armNonce = null;
  }
  conversation.conversationMode = 'running';
  saveState();
  ensureCapsuleRuntime(conversation);
  return {
    status: 'accepted',
    hash,
    prompt: effectivePrompt,
    usedTurnTokenHash,
    ...currentArmPayload(conversation),
  };
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
        hash,
        ok: true,
        finalMessage,
        stdoutMeta: result.stdoutMeta || null,
        stderrMeta: result.stderrMeta || null,
        consumed: false,
        at: Date.now(),
      };
      ensurePendingResultId(conversation);
      audit(conversation.conversationId, {
        type: 'codex_done',
        turn,
        jobId: result.jobId,
        code: result.code,
        stdoutMeta: result.stdoutMeta || null,
        stderrMeta: result.stderrMeta || null,
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
      hash,
      ok: false,
      finalMessage: failMessage,
      stdoutMeta: result.stdoutMeta || null,
      stderrMeta: result.stderrMeta || null,
      consumed: false,
      at: Date.now(),
    };
    ensurePendingResultId(conversation);
    audit(conversation.conversationId, {
      type: 'codex_failed',
      turn,
      jobId: result.jobId,
      code: result.code,
      errorClass: result.errorClass,
      stdoutMeta: result.stdoutMeta || null,
      stderrMeta: result.stderrMeta || null,
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
  ensureHashBuckets(conversation);
  if (hasUnconsumedPendingResult(conversation)) {
    audit(conversation.conversationId, {
      type: 'pending_result_blocked_force_execute',
      jobId: conversation.pendingResult.jobId,
      turn: conversation.pendingResult.turn,
    });
    return { ok: false, status: 'pending_result_exists' };
  }

  const effectivePrompt = decoratePrompt(conversation, prompt);
  const hash = hashPayload(effectivePrompt);
  conversation.activeDispatchHash = hash;
  rememberHash(conversation, 'attemptedHashes', hash);
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
  conversation.consecutiveFailures = result.ok ? 0 : conversation.consecutiveFailures + 1;
  conversation.pendingResult = {
    turn,
    jobId: result.jobId,
    hash,
    ok: result.ok,
    finalMessage: result.ok
      ? extractFinal(result.stdout)
      : `[Codex execution failed code=${result.code}]\n${String(result.stderr || '').slice(-2000)}`,
    stdoutMeta: result.stdoutMeta || null,
    stderrMeta: result.stderrMeta || null,
    consumed: false,
    at: Date.now(),
  };
  ensurePendingResultId(conversation);
  if (conversation.activeDispatchHash === hash) conversation.activeDispatchHash = null;
  conversation.updatedAt = Date.now();
  saveState();
  audit(conversation.conversationId, {
    type: result.ok ? 'codex_done' : 'codex_failed',
    turn,
    jobId: result.jobId,
    code: result.code,
    stdoutMeta: result.stdoutMeta || null,
    stderrMeta: result.stderrMeta || null,
  });
  return { ok: true, status: 'accepted', hash };
}

function sendJson(response, code, object) {
  const body = JSON.stringify(object);
  response.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin(response._aegisOrigin || ''),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-AegisLoop-Token',
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    let tooLarge = false;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      data += chunk;
    });
    request.on('end', () => {
      if (tooLarge) {
        const error = new Error('payload_too_large');
        error.statusCode = 413;
        return reject(error);
      }
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    request.on('error', reject);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  response._aegisOrigin = String(request.headers.origin || '').trim();

  if (request.method === 'OPTIONS') {
    if (url.pathname.startsWith('/api/') && !isApiOriginAllowed(request)) {
      return sendJson(response, 403, {
        error: 'origin_not_allowed',
        message: 'Origin is not allowed to call AegisLoop APIs',
      });
    }
    return sendJson(response, 200, { ok: true });
  }

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
    if (url.pathname.startsWith('/api/') && !isApiOriginAllowed(request)) {
      audit('_server', {
        type: 'origin_blocked',
        origin: request.headers.origin || '',
        path: url.pathname,
      });
      return sendJson(response, 403, {
        error: 'origin_not_allowed',
        message: 'Origin is not allowed to call AegisLoop APIs',
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
          ...currentArmPayload(c),
          loopState: c.loopState,
          pauseReason: c.pauseReason,
          turn: c.turn,
          consecutiveFailures: c.consecutiveFailures,
          lastJobId: c.lastJobId,
          activeDispatchHash: c.activeDispatchHash || null,
          hasPendingResult: !!(c.pendingResult && !c.pendingResult.consumed),
          pendingResultId: c.pendingResult && !c.pendingResult.consumed ? ensurePendingResultId(c) : null,
          leaderLease: c.leaderLease || null,
          blockedPayload: c.blockedPayload,
          capsule: c.capsule || null,
          briefing: getBriefingStatus(c),
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
      const leader = body.clientId ? ensureLeaderLease(conversation, body.clientId) : null;

      return sendJson(response, 200, {
        conversationId: conversation.conversationId,
        codexSessionId: conversation.codexSessionId,
        workspaceDir: conversation.workspaceDir,
        capsule: conversation.capsule || null,
        fullAuto: conversation.fullAuto,
        conversationMode: conversation.conversationMode || 'chat',
        ...currentArmPayload(conversation),
        loopState: conversation.loopState,
        contractVersion: CONFIG.contractVersion,
        briefing: getBriefingStatus(conversation),
        leaderLease: conversation.leaderLease || null,
        leader: leader ? !!leader.ok : false,
      });
    }

    if (url.pathname === '/api/dispatch' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      const leaderError = requireLeader(conversation, body.clientId);
      if (leaderError) return sendJson(response, 409, leaderError);
      if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
        return sendJson(response, 400, { error: 'prompt required' });
      }

      const prepared = prepareDispatch(conversation, body.prompt, {
        armId: body.armId,
        turnNonce: body.turnNonce,
        assistantMessageSig: body.assistantMessageSig,
        codeBlockHash: body.codeBlockHash,
      });
      if (prepared.status === 'accepted') {
        runDispatchAsync(conversation, prepared.prompt, prepared.hash);
      }
      return sendJson(response, 200, prepared);
    }

    if (url.pathname === '/api/mode' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      const leaderError = requireLeader(conversation, body.clientId);
      if (leaderError) return sendJson(response, 409, leaderError);

      if (body.action === 'chat') {
        setChatMode(conversation, body.reason || 'chat_mode');
        return sendJson(response, 200, {
          ok: true,
          conversationMode: conversation.conversationMode,
          loopState: conversation.loopState,
          pauseReason: conversation.pauseReason,
          ...currentArmPayload(conversation),
        });
      }

      if (body.action === 'freeze') {
        setFrozenMode(conversation);
        return sendJson(response, 200, {
          ok: true,
          conversationMode: conversation.conversationMode,
          loopState: conversation.loopState,
          pauseReason: conversation.pauseReason,
          ...currentArmPayload(conversation),
        });
      }

      if (body.action === 'arm_once' || body.action === 'arm_loop') {
        const maxDispatches = body.action === 'arm_once'
          ? 1
          : Math.max(1, Number(body.maxDispatches || DEFAULT_ARM_LOOP_MAX_DISPATCHES));
        const arm = armConversation(conversation, maxDispatches);
        return sendJson(response, 200, {
          ok: true,
          conversationMode: conversation.conversationMode,
          loopState: conversation.loopState,
          ...arm,
        });
      }

      return sendJson(response, 400, { error: 'unknown mode action' });
    }

    if (url.pathname === '/api/briefing' && request.method === 'GET') {
      const conversation = getConversation(url.searchParams.get('conversationId'));
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      const status = getBriefingStatus(conversation);
      let gptBrief = null;
      if (status.status === 'ready' || status.status === 'stale') {
        const gptPath = path.join(status.inbox, 'GPT_THREAD_BRIEF.md');
        if (fs.existsSync(gptPath)) gptBrief = fs.readFileSync(gptPath, 'utf8');
      }
      return sendJson(response, 200, {
        ok: true,
        briefing: status,
        gptBrief,
      });
    }

    if (url.pathname === '/api/briefing/materialize' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      const leaderError = requireLeader(conversation, body.clientId);
      if (leaderError) return sendJson(response, 409, leaderError);
      const result = materializeBriefing(conversation, body);
      if (!result.ok) return sendJson(response, 400, result);
      return sendJson(response, 200, result);
    }

    if (url.pathname === '/api/result' && request.method === 'GET') {
      const conversation = getConversation(url.searchParams.get('conversationId'));
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });

      if (conversation.pendingResult && !conversation.pendingResult.consumed) {
        const result = conversation.pendingResult;
        const resultId = ensurePendingResultId(conversation);
        if (conversation.ackedResultIds && conversation.ackedResultIds.includes(resultId)) {
          conversation.pendingResult.consumed = true;
          conversation.updatedAt = Date.now();
          saveState();
          return sendJson(response, 200, {
            hasResult: false,
            loopState: conversation.loopState,
            pauseReason: conversation.pauseReason,
          });
        }
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
      const leaderError = requireLeader(conversation, body.clientId);
      if (leaderError) return sendJson(response, 409, leaderError);
      if (!conversation.pendingResult || conversation.pendingResult.consumed) {
        if (body.resultId && conversation.ackedResultIds && conversation.ackedResultIds.includes(body.resultId)) {
          return sendJson(response, 200, { ok: true, status: 'already_acked', hasPendingResult: false });
        }
        return sendJson(response, 409, { error: 'no pending result' });
      }
      const pendingResultId = ensurePendingResultId(conversation);
      if (!body.resultId) return sendJson(response, 400, { error: 'resultId required' });
      if (body.resultId !== pendingResultId) {
        if (conversation.ackedResultIds && conversation.ackedResultIds.includes(body.resultId)) {
          return sendJson(response, 200, { ok: true, status: 'already_acked', hasPendingResult: false });
        }
        return sendJson(response, 409, {
          error: 'resultId mismatch',
          pendingResultId,
        });
      }
      if (body.jobId && body.jobId !== conversation.pendingResult.jobId) {
        return sendJson(response, 409, {
          error: 'jobId mismatch',
          pendingJobId: conversation.pendingResult.jobId,
        });
      }

      ensureHashBuckets(conversation);
      const ackedResult = conversation.pendingResult;
      if (ackedResult.ok && ackedResult.hash) {
        rememberHash(conversation, 'ackedHashes', ackedResult.hash);
        rememberHash(conversation, 'executedHashes', ackedResult.hash);
      } else if (ackedResult.hash) {
        rememberHash(conversation, 'failedHashes', ackedResult.hash);
      }
      rememberHash(conversation, 'ackedResultIds', pendingResultId, 1000);
      conversation.pendingResult.consumed = true;
      if (remainingDispatches(conversation) > 0 && conversation.turnNonce && Date.now() <= conversation.armExpiresAt) {
        conversation.conversationMode = 'review';
        conversation.loopState = 'running';
        conversation.pauseReason = null;
      } else {
        conversation.conversationMode = 'chat';
        conversation.loopState = 'paused';
        conversation.pauseReason = 'chat_mode';
        clearArm(conversation);
      }
      conversation.updatedAt = Date.now();
      saveState();
      audit(conversation.conversationId, {
        type: 'result_ack',
        jobId: ackedResult.jobId,
        turn: ackedResult.turn,
        hash: ackedResult.hash || null,
        resultOk: !!ackedResult.ok,
        conversationMode: conversation.conversationMode,
      });
      return sendJson(response, 200, {
        ok: true,
        hasPendingResult: false,
        conversationMode: conversation.conversationMode,
        loopState: conversation.loopState,
        pauseReason: conversation.pauseReason,
        ...currentArmPayload(conversation),
      });
    }

    if (url.pathname === '/api/result/nack' && request.method === 'POST') {
      const body = await readBody(request);
      const conversation = getConversation(body.conversationId);
      if (!conversation) return sendJson(response, 404, { error: 'unknown conversation' });
      const leaderError = requireLeader(conversation, body.clientId);
      if (leaderError) return sendJson(response, 409, leaderError);
      if (!conversation.pendingResult || conversation.pendingResult.consumed) {
        return sendJson(response, 409, { error: 'no pending result' });
      }
      const pendingResultId = ensurePendingResultId(conversation);
      if (!body.resultId) return sendJson(response, 400, { error: 'resultId required' });
      if (body.resultId !== pendingResultId) {
        return sendJson(response, 409, {
          error: 'resultId mismatch',
          pendingResultId,
        });
      }
      if (body.jobId && body.jobId !== conversation.pendingResult.jobId) {
        return sendJson(response, 409, {
          error: 'jobId mismatch',
          pendingJobId: conversation.pendingResult.jobId,
        });
      }

      conversation.loopState = 'paused';
      conversation.pauseReason = body.reason || 'result_not_acknowledged';
      ensureHashBuckets(conversation);
      if (conversation.pendingResult.hash) rememberHash(conversation, 'failedHashes', conversation.pendingResult.hash);
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
      const leaderError = requireLeader(conversation, body.clientId);
      if (leaderError) return sendJson(response, 409, leaderError);

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
        if (hasUnconsumedPendingResult(conversation)) {
          return sendJson(response, 409, {
            error: 'pending_result_exists',
            jobId: conversation.pendingResult.jobId,
            turn: conversation.pendingResult.turn,
          });
        }
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
        ensureHashBuckets(conversation);
        if (conversation.blockedPayload && conversation.blockedPayload.hash) {
          rememberHash(conversation, 'ackedHashes', conversation.blockedPayload.hash);
          rememberHash(conversation, 'executedHashes', conversation.blockedPayload.hash);
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
    if (error && error.statusCode === 413) {
      return sendJson(response, 413, {
        error: 'payload_too_large',
        maxBodyBytes: MAX_BODY_BYTES,
      });
    }
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
