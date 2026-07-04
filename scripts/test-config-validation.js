'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateConfig } = require('../config-validation');

const ROOT = path.resolve(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvalid(config, pattern) {
  assert.throws(() => validateConfig(config), pattern);
}

const example = readJson(path.join(ROOT, 'config.example.json'));
assert.strictEqual(validateConfig(example), true);

{
  const config = clone(example);
  config.port = 70000;
  expectInvalid(config, /port must be an integer between 1 and 65535/);
}

{
  const config = clone(example);
  config.bindings[0].conversationMode = 'run-forever';
  expectInvalid(config, /conversationMode must be one of/);
}

{
  const config = clone(example);
  config.bindings.push(clone(config.bindings[0]));
  expectInvalid(config, /conversationId duplicates/);
}

{
  const config = clone(example);
  config.codex.args = 'codex exec resume';
  expectInvalid(config, /codex\.args must be an array of strings/);
}

{
  const config = clone(example);
  config.bindings[0].capsule.forbiddenBranchContext = 'V1-OTHER';
  expectInvalid(config, /forbiddenBranchContext must be an array of strings/);
}

{
  const config = clone(example);
  config.autoApproveGateRules = ['approved_for_scoring', 123];
  expectInvalid(config, /autoApproveGateRules must be an array of strings/);
}

{
  const config = clone(example);
  config.allowedOrigins = ['https://chatgpt.com', 123];
  expectInvalid(config, /allowedOrigins must be an array of strings/);
}

{
  const config = clone(example);
  config.denylist[0].pattern = '[';
  expectInvalid(config, /not a valid regular expression/);
}

console.log('config validation tests passed');
