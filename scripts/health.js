const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_PORT = 17380;
const REQUEST_TIMEOUT_MS = 3000;

function readTarget(root) {
  const configPath = path.join(root, 'config.json');
  if (!fs.existsSync(configPath)) {
    return {
      config: 'missing',
      port: DEFAULT_PORT,
      warning: 'config.json is missing; checking the default bridge port 17380',
    };
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    return { config: 'invalid', error: `config.json is not valid JSON: ${error.message}` };
  }

  const port = Number(config.port || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { config: 'invalid', error: 'config.json port must be an integer from 1 to 65535' };
  }

  return { config: 'found', port };
}

function requestHealth(port, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/health',
      timeout: timeoutMs,
      headers: { Accept: 'application/json' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        let json;
        try { json = JSON.parse(body); } catch (_) { json = null; }
        if (response.statusCode === 200 && json && json.ok === true && json.service === 'aegisloop-bridge') {
          return resolve({ ok: true, statusCode: response.statusCode, json });
        }
        resolve({
          ok: false,
          reason: 'unexpected_service',
          statusCode: response.statusCode,
          message: 'the port responded, but it was not an AegisLoop bridge health response',
        });
      });
    });

    request.on('timeout', () => {
      request.destroy();
      resolve({ ok: false, reason: 'timeout', message: 'the health request timed out' });
    });
    request.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        return resolve({
          ok: false,
          reason: 'offline',
          message: 'nothing is listening on the configured bridge port',
        });
      }
      resolve({ ok: false, reason: 'network_error', message: error.message });
    });
  });
}

async function diagnose(root = path.resolve(__dirname, '..'), timeoutMs = REQUEST_TIMEOUT_MS) {
  const target = readTarget(root);
  if (target.config === 'invalid') {
    return { ok: false, target, health: null };
  }
  const health = await requestHealth(target.port, timeoutMs);
  return { ok: health.ok, target, health };
}

function printDiagnosis(result) {
  console.log('AegisLoop Health');
  console.log('');
  if (result.target.config === 'invalid') {
    console.log(`[FAIL] Configuration - ${result.target.error}`);
    console.log('[NEXT] Fix config.json, then run npm run health again.');
    return;
  }
  if (result.target.warning) {
    console.log(`[WARN] Configuration - ${result.target.warning}`);
  } else {
    console.log(`[OK]   Configuration - using port ${result.target.port}`);
  }

  if (result.ok) {
    const conversations = Number(result.health.json.conversations || 0);
    console.log(`[OK]   Local bridge - online at http://127.0.0.1:${result.target.port}`);
    console.log(`[OK]   Registered conversations - ${conversations}`);
    console.log('[NEXT] The browser extension can connect or retry now.');
    return;
  }

  console.log(`[FAIL] Local bridge - ${result.health.message}`);
  if (result.health.reason === 'unexpected_service') {
    console.log(`[NEXT] Port ${result.target.port} is in use by another service or the bridge URL is wrong.`);
  } else {
    console.log('[NEXT] Start AegisLoop with npm start, then run npm run health again.');
  }
  console.log('[NEXT] After the bridge is online, reopen the extension panel and retry.');
}

async function main() {
  const result = await diagnose();
  printDiagnosis(result);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[FAIL] Health check - ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_PORT, diagnose, printDiagnosis, readTarget, requestHealth };
