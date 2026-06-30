'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_DIR = path.join(ROOT, 'templates', 'briefings');
const FILES = [
  'GPT_THREAD_BRIEF.md',
  'CODEX_EXECUTION_BRIEF.md',
  'RESEARCH_RULES.md',
  'FROZEN_BRANCHES.md',
  'CURRENT_OBJECTIVE.md',
];

const values = {
  PROJECT_ID: 'MonsterLifecycle',
  ACTIVE_BRANCH: 'SECOND_WAVE_REPAIR',
  CURRENT_TASK: 'V8.4b-SW Path Metric Coverage Repair',
  CURRENT_OBJECTIVE: 'V8.4b-SW Path Metric Coverage Repair',
  FROZEN_BRANCH_OR_CONTEXT: 'Ziwei V2.4F',
  STATE_FACT_1: 'Run Capsule is enabled.',
  STATE_FACT_2: 'Codex must read inbox files.',
  STATE_FACT_3: 'Artifacts must stay under allowed_write_root.',
  INPUT_PATH_1: 'C:\\source-project',
  INPUT_PATH_2: 'C:\\AegisLoopRuntime\\runs\\MonsterLifecycle\\SECOND_WAVE_REPAIR\\run-001\\inbox',
  OUTPUT_PATH_UNDER_ALLOWED_WRITE_ROOT: 'C:\\AegisLoopRuntime\\runs\\MonsterLifecycle\\SECOND_WAVE_REPAIR\\run-001\\outbox',
  required_output_1: 'result.md',
  required_output_2: 'audit.csv',
  CRITERION_1: 'Do not modify source_dir.',
  CRITERION_2: 'Write artifacts only under allowed_write_root.',
  CRITERION_3: 'Follow RESEARCH_RULES.md.',
  COMMAND_1: 'node --version',
  COMMAND_2: 'dir',
  COMMAND_3: 'echo ok',
};

function render(name) {
  let text = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8').replace(/^\uFEFF/, '');
  for (const [key, value] of Object.entries(values)) {
    text = text.split(key).join(value);
  }
  return text;
}

function main() {
  for (const name of FILES) {
    assert.ok(fs.existsSync(path.join(TEMPLATE_DIR, name)), 'missing template ' + name);
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aegisloop-briefing-'));
  const inbox = path.join(root, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });

  for (const name of FILES) {
    const rendered = render(name);
    assert.ok(!/PROJECT_ID|ACTIVE_BRANCH|CURRENT_TASK|CURRENT_OBJECTIVE/.test(rendered), name + ' has unresolved primary placeholder');
    fs.writeFileSync(path.join(inbox, name), rendered, 'utf8');
  }

  assert.ok(fs.readFileSync(path.join(inbox, 'GPT_THREAD_BRIEF.md'), 'utf8').includes('MonsterLifecycle'));
  assert.ok(fs.readFileSync(path.join(inbox, 'CODEX_EXECUTION_BRIEF.md'), 'utf8').includes('SECOND_WAVE_REPAIR'));
  assert.ok(fs.readFileSync(path.join(inbox, 'CURRENT_OBJECTIVE.md'), 'utf8').includes('Path Metric Coverage Repair'));

  const objective = values.CURRENT_OBJECTIVE;
  const hash = crypto.createHash('sha256').update(JSON.stringify({
    templateVersion: 'briefing-1',
    projectId: values.PROJECT_ID,
    activeBranch: values.ACTIVE_BRANCH,
    runId: 'run-001',
    objective,
  })).digest('hex').slice(0, 16);
  fs.writeFileSync(path.join(inbox, 'briefing.json'), JSON.stringify({
    templateVersion: 'briefing-1',
    projectId: values.PROJECT_ID,
    activeBranch: values.ACTIVE_BRANCH,
    runId: 'run-001',
    objective,
    briefingHash: hash,
  }, null, 2), 'utf8');

  assert.ok(fs.existsSync(path.join(inbox, 'GPT_THREAD_BRIEF.md')));
  assert.ok(fs.existsSync(path.join(inbox, 'CODEX_EXECUTION_BRIEF.md')));
  assert.ok(fs.existsSync(path.join(inbox, 'briefing.json')));
  console.log('briefing materializer simulation passed:', root);
}

main();
