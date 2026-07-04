'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function readJson(relative) {
  return JSON.parse(read(relative));
}

const pkg = readJson('package.json');
const manifest = readJson('chrome-extension/manifest.json');
const content = read('chrome-extension/content.js');
const background = read('chrome-extension/background.js');

assert.strictEqual(manifest.manifest_version, 3, 'extension must stay MV3');
assert.strictEqual(manifest.version, pkg.version, 'manifest version must match package.json');
assert.match(content, new RegExp(`CONTENT_VERSION = '${pkg.version.replace(/\./g, '\\.')}'`), 'content version must match package.json');

const hostPermissions = manifest.host_permissions || [];
assert.ok(hostPermissions.includes('https://chatgpt.com/*'), 'manifest must include chatgpt.com host permission');
assert.ok(hostPermissions.includes('https://chat.openai.com/*'), 'manifest must include chat.openai.com host permission');
assert.ok(hostPermissions.includes('http://127.0.0.1/*'), 'manifest must allow local bridge on 127.0.0.1 any port');
assert.ok(hostPermissions.includes('http://localhost/*'), 'manifest must allow local bridge on localhost any port');
assert.ok(!hostPermissions.some(pattern => /127\.0\.0\.1:\d+/.test(pattern)), 'manifest must not pin 127.0.0.1 to one port');

assert.match(background, /DEFAULT_BRIDGE = 'http:\/\/127\.0\.0\.1:17380'/, 'background must keep safe default bridge URL');
assert.match(background, /normalizeBridgeUrl/, 'background must normalize bridge URLs');
assert.match(background, /127\.0\.0\.1/, 'background must allow 127.0.0.1');
assert.match(background, /localhost/, 'background must allow localhost');
assert.match(background, /bridge path must start with \//, 'background must reject non-path bridge requests');
assert.match(content, /bridgeUrl: 'http:\/\/127\.0\.0\.1:17380'/, 'content must keep default bridge URL');
assert.match(content, /loadBridgeUrl/, 'content must load persisted bridge URL');
assert.match(content, /saveBridgeUrl/, 'content must save bridge URL');
assert.match(content, /bridgeUrl: LE\.bridgeUrl/, 'content must forward configured bridge URL to background');

console.log('extension compatibility checks passed');
