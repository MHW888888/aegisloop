'use strict';

const VALID_SANDBOX_POLICIES = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
]);

function configuredCodexSandboxPolicy(codexConfig) {
  const args = Array.isArray(codexConfig && codexConfig.args)
    ? codexConfig.args.map(String)
    : [];

  if (args.includes('--dangerously-bypass-approvals-and-sandbox')) {
    return {
      policy: 'danger-full-access',
      configured: true,
      valid: true,
      enforced: false,
      source: 'codex-cli-bypass-flag',
    };
  }

  let policy = 'not-specified';
  let configured = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--sandbox' || arg === '-s') {
      configured = true;
      policy = args[index + 1] || 'missing-value';
      break;
    }
    if (arg.startsWith('--sandbox=') || arg.startsWith('-s=')) {
      configured = true;
      policy = arg.slice(arg.indexOf('=') + 1) || 'missing-value';
      break;
    }
  }

  const valid = !configured || VALID_SANDBOX_POLICIES.has(policy);
  return {
    policy,
    configured,
    valid,
    enforced: valid && ['read-only', 'workspace-write'].includes(policy),
    source: configured ? 'codex-cli-sandbox-flag' : 'aegisloop-config',
  };
}

module.exports = { configuredCodexSandboxPolicy };
