param(
  [string]$CdpUrl = "http://127.0.0.1:9222",
  [string]$OutDir = "output/chatgpt-model-smoke",
  [string[]]$Models = @("Balanced", "Smart", "Fast", "Advanced", "Ultra", "Professional", "GPT-5.5", "GPT-5.4", "GPT-5.3", "o3"),
  [switch]$SelfCheck
)

$ErrorActionPreference = "Stop"

function Info($Text) {
  Write-Host "[info] $Text"
}

function Fail($Text) {
  Write-Host "[blocked] $Text"
  exit 2
}

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$OutPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $Root $OutDir }

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw "node was not found. Install Node.js first."
}

if ($SelfCheck) {
  Info "node found: $($node.Source)"
  Info "script ready. Open Chrome with --remote-debugging-port=9222, log into ChatGPT, then run without -SelfCheck."
  exit 0
}

try {
  $version = Invoke-RestMethod -Method Get -Uri "$CdpUrl/json/version" -TimeoutSec 2 -ErrorAction Stop
  Info "connected to Chrome DevTools: $($version.Browser)"
} catch {
  Fail "No Chrome DevTools endpoint at $CdpUrl. Start a dedicated smoke-test Chrome first."
}

New-Item -ItemType Directory -Force -Path $OutPath | Out-Null

$payload = @{
  cdpUrl = $CdpUrl
  outDir = $OutPath
  models = $Models
} | ConvertTo-Json -Compress

$temp = Join-Path $env:TEMP ("aegisloop-chatgpt-model-smoke-" + [guid]::NewGuid() + ".mjs")

$js = @'
import fs from 'node:fs';
import path from 'node:path';

const payload = JSON.parse(process.env.AEGISLOOP_MODEL_SMOKE_PAYLOAD || '{}');
const { cdpUrl, outDir, models } = payload;

function line(status, message, extra = {}) {
  const row = { ts: new Date().toISOString(), status, message, ...extra };
  console.log(JSON.stringify(row));
  return row;
}

function isBrowserChallengeText(text) {
  return /Enable JavaScript and cookies|challenge-error-text|cf_chl|\u9A8C\u8BC1\u6210\u529F|\u6B63\u5728\u7B49\u5F85 chatgpt\.com/.test(text || '');
}

function hasBrowserChallenge(values) {
  return Array.isArray(values) && values.some(isBrowserChallengeText);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener('message', event => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10000);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 15000);
    });
  }
  close() {
    try { this.ws.close(); } catch (_) {}
  }
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function cdpJson(pathname, init) {
  const base = cdpUrl.replace(/\/$/, '');
  const res = await fetch(base + pathname, init);
  if (!res.ok) throw new Error(`${pathname} failed: ${res.status}`);
  return await res.json();
}

async function findChatGptTarget() {
  let pages = await cdpJson('/json');
  let page = pages.find(p => /https:\/\/chatgpt\.com\//.test(p.url || ''));
  if (page) return page;
  page = await cdpJson('/json/new?' + encodeURIComponent('https://chatgpt.com/'), { method: 'PUT' });
  await sleep(3000);
  return page;
}

async function evalJson(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result ? result.result.value : null;
}

async function readRoute(client) {
  return await evalJson(client, `(() => {
    const panel = document.querySelector('#le-panel');
    const txt = id => {
      const el = document.querySelector(id);
      return el ? (el.textContent || '').trim() : '';
    };
    const m = location.href.match(/\\/c\\/([^/?#]+)/);
    return {
      url: location.href,
      conversationId: m ? m[1] : null,
      panelVisible: !!panel,
      bridge: txt('#le-bridge'),
      codexSession: txt('#le-sess'),
      mode: txt('#le-state')
    };
  })()`);
}

async function clickByText(client, patternSource, exactText = null) {
  return await evalJson(client, `(() => {
    const re = new RegExp(${JSON.stringify(patternSource)}, 'i');
    const exact = ${JSON.stringify(exactText)};
    const textOf = el => (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const nodes = [...document.querySelectorAll('button, [role="button"], [role="menuitem"], a, div')];
    const visible = el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const found = nodes.find(el => visible(el) && (exact ? textOf(el) === exact : re.test(textOf(el))));
    if (!found) {
      const available = nodes
        .filter(visible)
        .map(textOf)
        .filter(Boolean)
        .slice(0, 20)
        .map(text => text.length > 120 ? text.slice(0, 120) + '...' : text);
      return { ok: false, available };
    }
    found.click();
    return { ok: true, text: textOf(found) };
  })()`);
}

async function openModelMenu(client) {
  const clicked = await clickByText(client, '\\u6A21\\u578B\\u9009\\u62E9\\u5668|model selector|ChatGPT|\\u667A\\u80FD|\\u6781\\u901F|\\u5747\\u8861|\\u9AD8\\u7EA7|\\u8D85\\u9AD8|\\u4E13\\u4E1A|GPT-5');
  if (clicked.ok) await sleep(700);
  return clicked;
}

async function chooseModel(client, model) {
  const opened = await openModelMenu(client);
  if (!opened.ok) {
    return {
      ok: false,
      reason: hasBrowserChallenge(opened.available) ? 'browser_challenge' : 'model_menu_not_found',
      opened
    };
  }

  const aliases = {
    Smart: ['Smart', '\u667A\u80FD'],
    Fast: ['Fast', '\u6781\u901F'],
    Balanced: ['Balanced', '\u5747\u8861'],
    Advanced: ['Advanced', '\u9AD8\u7EA7'],
    Ultra: ['Ultra', '\u8D85\u9AD8'],
    Professional: ['Professional', '\u4E13\u4E1A'],
  };

  const labels = aliases[model] || [model];
  for (const label of labels) {
    const clicked = await clickByText(client, label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), label);
    if (clicked.ok) {
      await sleep(1500);
      return { ok: true, reason: 'clicked', label, clicked };
    }
  }

  if (/^GPT-5\\.|^o3$/i.test(model)) {
    const parent = await clickByText(client, 'GPT-5\\.5|GPT-5|model');
    if (!parent.ok && hasBrowserChallenge(parent.available)) {
      return { ok: false, reason: 'browser_challenge', parent };
    }
    if (parent.ok) {
      await sleep(700);
      for (const label of labels) {
        const clicked = await clickByText(client, label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), label);
        if (clicked.ok) {
          await sleep(1500);
          return { ok: true, reason: 'clicked_after_parent_menu', label, parent, clicked };
        }
      }
    }
    return { ok: false, reason: 'nested_model_option_not_found', parent };
  }

  return { ok: false, reason: 'model_option_not_found' };
}

if (typeof WebSocket === 'undefined') {
  throw new Error('This smoke script needs Node.js with global WebSocket support.');
}

const target = await findChatGptTarget();
const client = new CdpClient(target.webSocketDebuggerUrl);
await client.connect();
await client.send('Runtime.enable');
await client.send('Page.enable');
await sleep(3000);

let bodyText = await evalJson(client, `document.body ? document.body.innerText : ''`);
let loginVisible = /\u767B\u5F55|Log in|Sign up|\u514D\u8D39\u6CE8\u518C/.test(bodyText || '');
let browserChallengeVisible = isBrowserChallengeText(bodyText);
const initialRoute = await readRoute(client);
const records = [];
records.push(line('info', 'initial route', initialRoute));

if (!browserChallengeVisible && !initialRoute.conversationId && !initialRoute.panelVisible) {
  await sleep(3000);
  bodyText = await evalJson(client, `document.body ? document.body.innerText : ''`);
  loginVisible = /\u767B\u5F55|Log in|Sign up|\u514D\u8D39\u6CE8\u518C/.test(bodyText || '');
  browserChallengeVisible = isBrowserChallengeText(bodyText);
}

if (browserChallengeVisible) {
  const screenshot = path.join(outDir, 'blocked-browser-challenge.png');
  try {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
  } catch (_) {}
  records.push(line('blocked', 'ChatGPT showed a browser verification page. Use a normal dedicated Chrome window, pass the check, then rerun.', { screenshot }));
  fs.writeFileSync(path.join(outDir, 'model-smoke-result.json'), JSON.stringify({ ok: false, reason: 'browser_challenge', records }, null, 2));
  client.close();
  process.exit(2);
}

if (loginVisible && !initialRoute.conversationId) {
  const screenshot = path.join(outDir, 'blocked-login.png');
  try {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
  } catch (_) {}
  records.push(line('blocked', 'ChatGPT is not logged in in this controlled browser. Log in, then rerun.', { screenshot }));
  fs.writeFileSync(path.join(outDir, 'model-smoke-result.json'), JSON.stringify({ ok: false, reason: 'login_required', records }, null, 2));
  client.close();
  process.exit(2);
}

if (!initialRoute.panelVisible) {
  records.push(line('warn', 'AegisLoop panel not visible. Extension may not be loaded in this Chrome profile.', initialRoute));
}

const baseConversationId = initialRoute.conversationId;
const baseSession = initialRoute.codexSession;

for (const model of models) {
  const before = await readRoute(client);
  const selected = await chooseModel(client, model);
  if (selected.reason === 'browser_challenge') {
    const screenshot = path.join(outDir, 'blocked-browser-challenge.png');
    try {
      const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
    } catch (_) {}
    records.push(line('blocked', 'ChatGPT showed a browser verification page while opening the model menu. Use a normal dedicated Chrome window, pass the check, then rerun.', { model, selected, screenshot }));
    fs.writeFileSync(path.join(outDir, 'model-smoke-result.json'), JSON.stringify({ ok: false, reason: 'browser_challenge', records }, null, 2));
    client.close();
    process.exit(2);
  }
  const after = await readRoute(client);
  const routeStable = (!baseConversationId || after.conversationId === baseConversationId)
    && (!baseSession || !after.codexSession || after.codexSession === baseSession);
  records.push(line(selected.ok && routeStable ? 'pass' : 'warn', `model ${model}`, {
    model,
    selected,
    before,
    after,
    routeStable,
  }));
}

const screenshot = path.join(outDir, 'chatgpt-model-smoke-final.png');
try {
  const shot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(screenshot, Buffer.from(shot.data, 'base64'));
} catch (_) {}
const ok = !records.some(row => row.status === 'warn' || row.status === 'blocked');
fs.writeFileSync(path.join(outDir, 'model-smoke-result.json'), JSON.stringify({ ok, screenshot, records }, null, 2));
client.close();
if (!ok) process.exit(1);
'@

Set-Content -LiteralPath $temp -Value $js -Encoding UTF8

$nodeExit = 0
try {
  $env:AEGISLOOP_MODEL_SMOKE_PAYLOAD = $payload
  node $temp
  $nodeExit = $LASTEXITCODE
} finally {
  Remove-Item Env:\AEGISLOOP_MODEL_SMOKE_PAYLOAD -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}

if ($nodeExit -ne 0) {
  exit $nodeExit
}
