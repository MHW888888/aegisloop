# Tester Guide

This guide is for people who want to help AegisLoop without writing code.

Most useful tester reports take 5-10 minutes.

## Pick One Small Path

Choose one environment:

| Path | Good report |
| --- | --- |
| Windows + Chrome | Does the panel appear and stay connected after model switching? |
| Windows + Edge | Does the extension load and keep the same route? |
| Windows + Brave | Does Brave privacy/shield behavior affect the bridge? |
| macOS + Chrome | Does setup and Arm one run work on macOS? |
| macOS + Edge | Does Edge behave like Chrome on macOS? |
| Chinese ChatGPT UI | Are model labels and panel state still understandable? |
| GPT-5.5 / 5.4 / 5.3 / o3 | Does the model return a visible fenced `codex` JSON block? |

Please do not claim several paths at once. One clear report is more useful than a broad incomplete test.

## 5-Minute Smoke

1. Start the local bridge with `npm start`.
2. Open ChatGPT in a dedicated conversation.
3. Confirm the AegisLoop panel is visible.
4. Confirm the panel version.
5. Switch one ChatGPT model mode, if your account has the option.
6. Confirm the same ChatGPT conversation remains connected to the same local Codex route.
7. Export a Debug Snapshot if anything looks wrong.

## 10-Minute Arm Test

Only run this in a dedicated runner thread, not your normal chat thread.

1. Start the local bridge.
2. Open a dedicated ChatGPT runner conversation.
3. Use the AegisLoop starter text.
4. Click `Arm one run`.
5. Wait for a visible fenced `codex` JSON block.
6. Confirm the panel does not fall back to Chat Mode while a slow model is still replying.
7. Report whether the route completed, stayed waiting, or showed a clear error.

## Report Template

Copy this into the GitHub issue:

```text
OS:
Browser:
Browser version:
ChatGPT UI language:
AegisLoop version:
Bridge status: online / offline / blocked
Model mode tested:
Result: pass / partial / blocked
What happened:
Debug Snapshot included: yes / no
Sanitized screenshot included: yes / no
Notes:
```

## Safety Rules

Do not include:

- real conversation IDs;
- local private paths;
- tokens or API keys;
- private workspace names;
- private project content;
- raw Codex output from sensitive projects.

If you include a screenshot, crop or blur anything private.

## What Counts As Done

A tester task is complete when the issue has:

- the report template filled out;
- pass / partial / blocked result;
- enough detail for a maintainer to reproduce or understand the behavior;
- no secrets or private identifiers.

You do not need to open a pull request for a smoke report.
