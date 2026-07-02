const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const EXAMPLE_CONFIG_PATH = path.join(ROOT, 'config.example.json');
const EXTENSION_MANIFEST_PATH = path.join(ROOT, 'chrome-extension', 'manifest.json');

const rows = [];

function mark(level, label, detail) {
  rows.push({ level, label, detail });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function exists(file) {
  try {
    return fs.existsSync(file);
  } catch (_) {
    return false;
  }
}

function isPlaceholder(value) {
  return typeof value === 'string' && /YOUR_|\\path\\to\\your|C:\\path\\to/i.test(value);
}

function checkConfig() {
  const hasConfig = exists(CONFIG_PATH);
  const configFile = hasConfig ? CONFIG_PATH : EXAMPLE_CONFIG_PATH;

  if (hasConfig) {
    mark('ok', 'config.json', 'found');
  } else {
    mark('warn', 'config.json', 'missing; copy config.example.json to config.json before real use');
  }

  let config;
  try {
    config = readJson(configFile);
    mark('ok', path.basename(configFile), 'valid JSON');
  } catch (error) {
    mark('fail', path.basename(configFile), error.message);
    return;
  }

  if (typeof config.port === 'number' && config.port > 0) {
    mark('ok', 'port', String(config.port));
  } else {
    mark('warn', 'port', 'missing or invalid; default bridge port is 17380');
  }

  if (config.apiToken) {
    mark('ok', 'apiToken', 'configured; value hidden');
  } else {
    mark('warn', 'apiToken', 'empty; acceptable for private throwaway setups only');
  }

  if (config.runtimeRoot && !isPlaceholder(config.runtimeRoot)) {
    mark('ok', 'runtimeRoot', config.runtimeRoot);
  } else {
    mark('warn', 'runtimeRoot', 'missing or placeholder');
  }

  if (!Array.isArray(config.bindings) || config.bindings.length === 0) {
    mark('fail', 'bindings', 'must contain at least one binding');
  } else {
    mark('ok', 'bindings', `${config.bindings.length} configured`);
    config.bindings.forEach((binding, index) => {
      const prefix = `bindings[${index}]`;
      ['conversationId', 'codexSessionId', 'workspaceDir'].forEach((key) => {
        const value = binding && binding[key];
        if (!value || isPlaceholder(value)) {
          mark('warn', `${prefix}.${key}`, 'missing or placeholder');
        }
      });
      if (binding && binding.workspaceDir && !isPlaceholder(binding.workspaceDir)) {
        mark(exists(binding.workspaceDir) ? 'ok' : 'warn', `${prefix}.workspaceDir`, binding.workspaceDir);
      }
      const mode = binding && binding.conversationMode;
      if (!mode || mode === 'chat') {
        mark('ok', `${prefix}.conversationMode`, mode || 'chat by default');
      } else if (['armed', 'frozen'].includes(mode)) {
        mark('warn', `${prefix}.conversationMode`, `${mode}; chat is safest for startup`);
      } else {
        mark('fail', `${prefix}.conversationMode`, `unknown mode: ${mode}`);
      }
    });
  }

  if (config.codex && config.codex.bin && !isPlaceholder(config.codex.bin)) {
    mark(exists(config.codex.bin) ? 'ok' : 'warn', 'codex.bin', config.codex.bin);
  } else {
    mark('warn', 'codex.bin', 'missing or placeholder');
  }
}

function checkProjectFiles() {
  [
    'server.js',
    'launch.ps1',
    'chrome-extension/content.js',
    'chrome-extension/background.js',
    'templates/briefings/GPT_THREAD_BRIEF.md',
    'templates/briefings/CODEX_EXECUTION_BRIEF.md',
  ].forEach((relative) => {
    mark(exists(path.join(ROOT, relative)) ? 'ok' : 'fail', relative, exists(path.join(ROOT, relative)) ? 'found' : 'missing');
  });

  try {
    const manifest = readJson(EXTENSION_MANIFEST_PATH);
    mark('ok', 'chrome-extension/manifest.json', `valid JSON; version ${manifest.version || 'unknown'}`);
  } catch (error) {
    mark('fail', 'chrome-extension/manifest.json', error.message);
  }
}

function print() {
  console.log('AegisLoop Doctor');
  console.log('');
  rows.forEach((row) => {
    const tag = row.level.toUpperCase().padEnd(4);
    console.log(`[${tag}] ${row.label} - ${row.detail}`);
  });
  console.log('');
  const failCount = rows.filter((row) => row.level === 'fail').length;
  const warnCount = rows.filter((row) => row.level === 'warn').length;
  console.log(`Summary: ${failCount} fail, ${warnCount} warn`);
  if (failCount) process.exitCode = 1;
}

checkConfig();
checkProjectFiles();
print();
