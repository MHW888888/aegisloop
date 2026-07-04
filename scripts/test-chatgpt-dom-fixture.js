'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const content = fs.readFileSync(path.join(ROOT, 'chrome-extension', 'content.js'), 'utf8');

const fixture = `
<main>
  <article data-testid="conversation-turn-1">
    <div data-message-author-role="user">First task for AegisLoop.</div>
  </article>
  <article data-testid="conversation-turn-2">
    <div data-message-author-role="assistant">
      <p>Next local step:</p>
      <pre><code class="language-codex">{"aegisloop":true,"arm_nonce":"aegis-fixture","prompt":"Read README.md and report status."}</code></pre>
    </div>
  </article>
  <form data-testid="composer">
    <div contenteditable="true" role="textbox">Message AegisLoop</div>
    <button data-testid="send-button" aria-label="Send message"></button>
    <button aria-label="Stop generating"></button>
  </form>
</main>`;

assert.match(content, /data-message-author-role/, 'content must prefer explicit ChatGPT author-role markers');
assert.match(content, /article\[data-testid\^="conversation-turn"\]/, 'content must keep conversation-turn fallback');
assert.match(content, /data-testid="send-button"/, 'content must know the send-button test id');
assert.match(content, /contenteditable="true"/, 'content must support the contenteditable composer');
assert.match(content, /aria-label\*="Stop"/, 'content must keep a stop-button selector');
assert.match(content, /currentFreshReadyCodex/, 'content must detect fresh nonce codex blocks');
assert.match(content, /arm_nonce/, 'content must require arm nonce in the protocol path');
assert.match(content, /Selector health/, 'panel must expose selector health for real screenshots');
assert.match(content, /aegisloop_msg_id/, 'content must use unique message ids for submit confirmation');
assert.match(content, /resultId/, 'content must handle stable result ids for ACK/NACK');
assert.match(content, /clientId/, 'content must identify the active browser tab to the bridge');

const roleMatches = [...fixture.matchAll(/data-message-author-role="([^"]+)"/g)].map(match => match[1]);
assert.deepStrictEqual(roleMatches, ['user', 'assistant']);

const codexMatch = fixture.match(/<code class="language-codex">([^<]+)<\/code>/);
assert.ok(codexMatch, 'fixture must include a rendered codex code block');
const payload = JSON.parse(codexMatch[1]);
assert.strictEqual(payload.aegisloop, true);
assert.strictEqual(payload.arm_nonce, 'aegis-fixture');
assert.match(payload.prompt, /README\.md/);

const hasComposer = /contenteditable="true"/.test(fixture);
const hasSend = /data-testid="send-button"/.test(fixture);
const hasStop = /aria-label="Stop generating"/.test(fixture);
assert.ok(hasComposer && hasSend && hasStop, 'fixture must include composer, send, and stop controls');

console.log('ChatGPT DOM fixture checks passed');
