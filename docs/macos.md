# macOS Setup

This guide shows the macOS path for running AegisLoop locally.

It mirrors the Windows flow, but uses Terminal commands, POSIX paths, `curl`, and the macOS Chrome extension UI.

## What You Need

- macOS with Terminal access
- Google Chrome
- Node.js LTS and npm
- local Codex CLI access
- optional: GitHub CLI (`gh`) for maintainer tasks

Useful official references:

- GitHub CLI: <https://cli.github.com/>
- GitHub CLI Homebrew formula: <https://formulae.brew.sh/formula/gh>
- Node.js downloads: <https://nodejs.org/en/download>
- npm Node.js install guidance: <https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/>
- Chrome unpacked extension guide: <https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world>

## 1. Install Tools

If you use Homebrew:

```sh
brew install node gh
```

Then verify:

```sh
node -v
npm -v
gh --version
```

If you do not use Homebrew, install the LTS version from the Node.js download page. The npm documentation recommends using the Node.js installer on macOS and choosing the LTS release.

## 2. Clone AegisLoop

```sh
git clone https://github.com/MHW888888/aegisloop.git
cd aegisloop
```

## 3. Create Local Config

```sh
cp config.example.json config.json
npm run doctor
```

Edit `config.json`.

Typical macOS paths look like this:

```json
{
  "runtimeRoot": "/Users/YOUR_USER/AegisLoopRuntime",
  "bindings": [
    {
      "conversationId": "YOUR_CHATGPT_CONVERSATION_ID",
      "codexSessionId": "YOUR_CODEX_SESSION_ID",
      "workspaceDir": "/Users/YOUR_USER/projects/sample-workspace",
      "conversationMode": "chat"
    }
  ],
  "codex": {
    "bin": "/opt/homebrew/bin/node",
    "args": [
      "/Users/YOUR_USER/.npm-global/lib/node_modules/@openai/codex/bin/codex.js",
      "exec",
      "resume"
    ],
    "stdinFlag": "-"
  }
}
```

Find your real Node path:

```sh
which node
```

Find the global npm root if Codex is installed globally:

```sh
npm root -g
```

Apple Silicon Homebrew often uses `/opt/homebrew/bin/node`; Intel Homebrew often uses `/usr/local/bin/node`.

Run the doctor again after editing:

```sh
npm run doctor
```

## 4. Start The Bridge

Use either command:

```sh
npm start
```

or:

```sh
chmod +x scripts/start-bridge.sh
./scripts/start-bridge.sh
```

Check health:

```sh
curl http://127.0.0.1:17380/health
```

You should see a small JSON response.

## 5. Load The Chrome Extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `chrome-extension/` folder inside your cloned AegisLoop repo.
5. Open your bound ChatGPT conversation.
6. Hard refresh the page.

If your `config.json` has `apiToken`, enter the same token in the extension panel.

## 6. First Safe Run

Keep the page in **Chat Mode** until you are ready.

Recommended first flow:

1. Start the bridge.
2. Open the ChatGPT runner thread.
3. Generate or paste the GPT brief if this is a serious project.
4. Click **Use starter text**.
5. Click **Arm one run**.

For a harmless first Codex task, ask for a read-only project summary:

```text
Read the current project, summarize the state, list the safest next tasks, and do not modify files.
```

Use **Arm loop** only after one-run works and the thread has a clear stop condition.

## 7. macOS Troubleshooting

### `node` is not found

Close and reopen Terminal after installing Node.js, then run:

```sh
which node
node -v
```

### `permission denied: ./scripts/start-bridge.sh`

Run:

```sh
chmod +x scripts/start-bridge.sh
```

### Bridge is offline

Check:

```sh
curl http://127.0.0.1:17380/health
```

If another process is using the port, stop it or change the local bridge port in `config.json`.

### Chrome extension cannot reach the bridge

Confirm:

- the bridge is running;
- ChatGPT is opened at `https://chatgpt.com`;
- the extension was loaded from `chrome-extension/`;
- `apiToken` matches if enabled.

### Unicode or Chinese folder names

AegisLoop has a Unicode runtime smoke test, and macOS generally handles UTF-8 paths well.

For easiest first-run debugging, avoid iCloud-synced folders and start with a simple path such as:

```text
/Users/YOUR_USER/projects/aegisloop-sample
```

After the simple path works, move to a Unicode path if needed.

## 8. Maintainer Login On macOS

For issue and PR maintenance:

```sh
gh auth login --web
gh auth status
```

Do not paste GitHub tokens into ChatGPT, Codex, issues, PRs, docs, or screenshots.

## 中文速记

macOS 上最短路径：

```sh
brew install node gh
git clone https://github.com/MHW888888/aegisloop.git
cd aegisloop
cp config.example.json config.json
npm run doctor
npm start
curl http://127.0.0.1:17380/health
```

然后在 Chrome 里：

```text
chrome://extensions -> Developer mode -> Load unpacked -> 选择 chrome-extension/
```

第一次使用建议：

- 保持 Chat Mode，不要一上来 Arm loop。
- 先用 Arm one run。
- 第一条任务用只读总结，不要直接改代码。
- 严肃项目先 Generate briefing，再 Copy GPT brief。
- 普通问答请新开 ChatGPT 线程，不要混在 runner thread 里。
