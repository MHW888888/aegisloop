'use strict';

function configError(message) {
  const error = new Error('Invalid config.json: ' + message);
  error.code = 'AEGIS_CONFIG_INVALID';
  return error;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function assertString(value, name, options = {}) {
  const optional = options.optional === true;
  if (optional && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'string' || value.trim() === '') {
    throw configError(name + ' must be a non-empty string');
  }
}

function assertBoolean(value, name, options = {}) {
  const optional = options.optional === true;
  if (optional && (value === undefined || value === null)) return;
  if (typeof value !== 'boolean') {
    throw configError(name + ' must be a boolean');
  }
}

function assertInteger(value, name, options = {}) {
  const optional = options.optional === true;
  const min = options.min === undefined ? 0 : options.min;
  const max = options.max;
  if (optional && (value === undefined || value === null)) return;
  if (!Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
    const suffix = max === undefined ? ' >= ' + min : ' between ' + min + ' and ' + max;
    throw configError(name + ' must be an integer' + suffix);
  }
}

function assertStringArray(value, name, options = {}) {
  const optional = options.optional === true;
  if (optional && value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw configError(name + ' must be an array of strings');
  }
}

function validateBinding(binding, index, seenConversations) {
  const prefix = 'bindings[' + index + ']';
  if (!isPlainObject(binding)) throw configError(prefix + ' must be an object');

  assertString(binding.conversationId, prefix + '.conversationId');
  assertString(binding.codexSessionId, prefix + '.codexSessionId');
  assertString(binding.workspaceDir, prefix + '.workspaceDir');
  assertBoolean(binding.fullAuto, prefix + '.fullAuto', { optional: true });

  if (seenConversations.has(binding.conversationId)) {
    throw configError(prefix + '.conversationId duplicates another binding');
  }
  seenConversations.add(binding.conversationId);

  if (binding.conversationMode !== undefined) {
    assertString(binding.conversationMode, prefix + '.conversationMode');
    if (!['chat', 'armed', 'frozen'].includes(binding.conversationMode)) {
      throw configError(prefix + '.conversationMode must be one of: chat, armed, frozen');
    }
  }

  if (binding.capsule !== undefined) {
    if (!isPlainObject(binding.capsule)) throw configError(prefix + '.capsule must be an object');
    const capsule = binding.capsule;
    assertBoolean(capsule.enabled, prefix + '.capsule.enabled', { optional: true });
    assertString(capsule.projectId, prefix + '.capsule.projectId', { optional: true });
    assertString(capsule.activeBranch, prefix + '.capsule.activeBranch', { optional: true });
    assertString(capsule.branchMeaning, prefix + '.capsule.branchMeaning', { optional: true });
    assertString(capsule.runId, prefix + '.capsule.runId', { optional: true });
    assertString(capsule.mode, prefix + '.capsule.mode', { optional: true });
    assertString(capsule.runtimeRoot, prefix + '.capsule.runtimeRoot', { optional: true });
    assertString(capsule.allowedWriteRoot, prefix + '.capsule.allowedWriteRoot', { optional: true });
    assertBoolean(capsule.stageNamespaceRequired, prefix + '.capsule.stageNamespaceRequired', { optional: true });
    assertStringArray(capsule.forbiddenBranchContext, prefix + '.capsule.forbiddenBranchContext', { optional: true });
  }
}

function validateConfig(config) {
  if (!isPlainObject(config)) throw configError('root value must be an object');

  assertInteger(config.port, 'port', { optional: true, min: 1, max: 65535 });
  assertString(config.contractVersion, 'contractVersion', { optional: true });
  assertString(config.apiToken, 'apiToken', { optional: true });
  assertString(config.corsAllowOrigin, 'corsAllowOrigin', { optional: true });
  assertStringArray(config.allowedOrigins, 'allowedOrigins', { optional: true });
  assertInteger(config.armTtlMs, 'armTtlMs', { optional: true, min: 1 });
  assertInteger(config.armLoopMaxDispatches, 'armLoopMaxDispatches', { optional: true, min: 1 });
  assertInteger(config.leaderLeaseMs, 'leaderLeaseMs', { optional: true, min: 1000 });
  assertInteger(config.minIntervalMs, 'minIntervalMs', { optional: true, min: 0 });
  assertInteger(config.maxResultChars, 'maxResultChars', { optional: true, min: 1 });
  assertInteger(config.maxBodyBytes, 'maxBodyBytes', { optional: true, min: 1024 });
  assertInteger(config.outputBufferChars, 'outputBufferChars', { optional: true, min: 4096 });
  assertBoolean(config.debugAuditRaw, 'debugAuditRaw', { optional: true });
  assertString(config.runtimeRoot, 'runtimeRoot', { optional: true });
  assertString(config.briefingTemplateVersion, 'briefingTemplateVersion', { optional: true });
  assertString(config.feishuWebhook, 'feishuWebhook', { optional: true });
  assertStringArray(config.autoApproveGateRules, 'autoApproveGateRules', { optional: true });

  if (!Array.isArray(config.bindings)) throw configError('bindings must be an array');
  const seenConversations = new Set();
  config.bindings.forEach((binding, index) => validateBinding(binding, index, seenConversations));

  if (!isPlainObject(config.codex)) throw configError('codex must be an object');
  assertString(config.codex.bin, 'codex.bin');
  assertStringArray(config.codex.args, 'codex.args');
  assertString(config.codex.stdinFlag, 'codex.stdinFlag', { optional: true });
  assertInteger(config.codex.timeoutMs, 'codex.timeoutMs', { optional: true, min: 1 });

  if (config.breaker !== undefined) {
    if (!isPlainObject(config.breaker)) throw configError('breaker must be an object');
    assertInteger(config.breaker.maxConsecutiveFailures, 'breaker.maxConsecutiveFailures', { optional: true, min: 1 });
  }

  if (config.denylist !== undefined) {
    if (!Array.isArray(config.denylist)) throw configError('denylist must be an array');
    config.denylist.forEach((rule, index) => {
      const prefix = 'denylist[' + index + ']';
      if (!isPlainObject(rule)) throw configError(prefix + ' must be an object');
      assertString(rule.name, prefix + '.name');
      assertString(rule.pattern, prefix + '.pattern');
      assertString(rule.flags, prefix + '.flags', { optional: true });
      try {
        new RegExp(rule.pattern, rule.flags || 'i');
      } catch (error) {
        throw configError(prefix + '.pattern is not a valid regular expression: ' + error.message);
      }
    });
  }

  return true;
}

module.exports = {
  validateConfig,
};
