const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { diagnose, readTarget } = require('./health');

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-health-'));
  try {
    const missing = readTarget(root);
    assert.strictEqual(missing.config, 'missing');
    assert.strictEqual(missing.port, 17380);

    fs.writeFileSync(path.join(root, 'config.json'), '{broken', 'utf8');
    const invalid = await diagnose(root);
    assert.strictEqual(invalid.ok, false);
    assert.strictEqual(invalid.target.config, 'invalid');

    const bridge = await listen((request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, service: 'aegisloop-bridge', conversations: 2 }));
    });
    const bridgePort = bridge.address().port;
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: bridgePort }), 'utf8');
    const online = await diagnose(root);
    assert.strictEqual(online.ok, true);
    assert.strictEqual(online.health.json.conversations, 2);
    await close(bridge);

    const occupied = await listen((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('not aegisloop');
    });
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: occupied.address().port }), 'utf8');
    const wrongService = await diagnose(root);
    assert.strictEqual(wrongService.ok, false);
    assert.strictEqual(wrongService.health.reason, 'unexpected_service');
    await close(occupied);

    const stalled = await listen(() => {});
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: stalled.address().port }), 'utf8');
    const timedOut = await diagnose(root, 50);
    assert.strictEqual(timedOut.ok, false);
    assert.strictEqual(timedOut.health.reason, 'timeout');
    await close(stalled);

    const available = await listen((request, response) => response.end());
    const offlinePort = available.address().port;
    await close(available);
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: offlinePort }), 'utf8');
    const offline = await diagnose(root, 500);
    assert.strictEqual(offline.ok, false);
    assert.strictEqual(offline.health.reason, 'offline');

    console.log('Health diagnostic tests passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
