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

const BRIDGE = 'http://127.0.0.1:17380';

async function bridgeFetch(pathAndQuery, method, body) {
  const opt = {
    method: method || 'GET',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opt.body = JSON.stringify(body);

  const resp = await fetch(BRIDGE + pathAndQuery, opt);
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
  bridgeFetch(msg.path, msg.method, msg.body)
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
