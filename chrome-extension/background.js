/*
 * AegisLoop background service worker.
 *
 * This worker intentionally does only one thing: forward messages from the
 * ChatGPT content script to the local bridge at http://127.0.0.1:17380.
 * Keep loop state out of MV3 service workers because Chrome can suspend them.
 * The source of truth stays in the local bridge; the live loop stays in
 * content.js while the ChatGPT page is open.
 */
'use strict';

const DEFAULT_BRIDGE = 'http://127.0.0.1:17380';

function normalizeBridgeUrl(value) {
  const raw = String(value || DEFAULT_BRIDGE).trim().replace(/\/+$/, '');
  const url = new URL(raw);
  if (url.protocol !== 'http:') throw new Error('bridge URL must use http');
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('bridge URL must point to 127.0.0.1 or localhost');
  }
  return url.origin;
}

async function bridgeFetch(pathAndQuery, method, body, token, bridgeUrl) {
  if (!String(pathAndQuery || '').startsWith('/')) {
    throw new Error('bridge path must start with /');
  }
  const bridge = normalizeBridgeUrl(bridgeUrl);
  const opt = {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opt.headers['X-AegisLoop-Token'] = token;
  if (body !== undefined) opt.body = JSON.stringify(body);

  const resp = await fetch(bridge + pathAndQuery, opt);
  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  return { status: resp.status, json };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'BRIDGE') return false;
  bridgeFetch(msg.path, msg.method, msg.body, msg.token, msg.bridgeUrl)
    .then(r => sendResponse({ ok: true, ...r }))
    .catch(e => sendResponse({ ok: false, error: String(e) }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
});

chrome.alarms.onAlarm.addListener(() => {
  // no-op keepalive
});
