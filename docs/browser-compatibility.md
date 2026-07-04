# Browser Compatibility

AegisLoop is currently a Chromium MV3 extension plus a local Node bridge.

The safe support stance is:

| Browser | Status | Why |
| --- | --- | --- |
| Google Chrome | Primary target | Current extension is developed and tested as an unpacked Chrome MV3 extension. |
| Microsoft Edge | Recommended next target | Edge supports sideloading unpacked extensions in developer mode, and the AegisLoop extension uses Chromium MV3 APIs. |
| Brave / other Chromium browsers | Experimental | They may run the extension, but privacy shields or localhost restrictions can affect ChatGPT and `127.0.0.1` bridge access. |
| Firefox | Not packaged yet | Firefox WebExtensions support MV3 concepts such as `host_permissions`, but the current package and QA path are Chromium-first. |
| Tor Browser | Not recommended for normal AegisLoop use | Tor Project strongly discourages installing extra add-ons because they can weaken privacy and fingerprinting protections. |

## What To Test Per Browser

Use the same harmless first-run workflow in every browser:

1. Start the local bridge.
2. Open `http://127.0.0.1:17380/health`.
3. Load the unpacked extension if the browser supports it.
4. Open a ChatGPT runner thread.
5. Confirm the panel shows **Local bridge: online**.
6. Stay in **Chat Mode** and ask a normal question. It should not dispatch.
7. Click **Use starter text**.
8. Click **Arm one run**.
9. Confirm Codex result insertion and ACK.
10. Confirm **Freeze thread** prevents old `codex` blocks from dispatching.

## Edge Test Path

Microsoft Edge should be tested before Firefox/Tor because it is closest to Chrome.

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `chrome-extension/` folder.
5. Open ChatGPT and run the same first-run workflow.

Record:

- operating system;
- Edge version;
- AegisLoop version;
- whether `127.0.0.1` bridge access works;
- whether ChatGPT composer insertion works;
- whether result ACK works.

## Firefox / Tor Notes

Do not claim Firefox or Tor support until there is a separate tested package.

Before claiming Firefox support, verify:

- `manifest.json` compatibility;
- content script injection on ChatGPT;
- localhost bridge access;
- background/service worker behavior;
- storage and alarms behavior;
- result insertion and ACK/NACK.

Tor Browser should not be the default recommendation for AegisLoop. AegisLoop is a local automation bridge, while Tor Browser optimizes privacy and fingerprinting resistance. Extra extensions can undermine Tor Browser's privacy model.

## Useful Official References

- Chrome unpacked extension guide: <https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world>
- Microsoft Edge sideloading guide: <https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading>
- MDN `host_permissions`: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions>
- Tor Browser add-on warning: <https://support.torproject.org/tor-browser/features/plugins/>

## 中文速记

AegisLoop 目前应按这个优先级测试浏览器：

1. **Chrome**：主目标。
2. **Edge**：最值得马上补测，路径和 Chrome 很接近。
3. **Brave / 其他 Chromium 浏览器**：可以试，但要注意隐私盾牌可能影响 ChatGPT 或本地 bridge。
4. **Firefox**：不要直接承诺支持，需要单独 WebExtensions 适配和测试。
5. **Tor Browser / 洋葱浏览器**：不建议作为常规使用目标。Tor 官方不鼓励安装额外扩展，因为可能削弱隐私和指纹保护。

对外宣传时可以说：

```text
Chrome is the primary target. Edge is the next recommended compatibility target.
Firefox/Tor are not officially supported yet.
```

