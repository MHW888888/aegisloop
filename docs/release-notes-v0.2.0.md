# AegisLoop v0.2.0 - Lite

This release focuses on first-run clarity rather than more automation power.

## Highlights

- Friendlier README positioning.
- New "Who it is for" section.
- New comparison table for adjacent tools.
- New first-run guide.
- New troubleshooting guide.
- Friendlier Chrome extension panel labels:
  - `Local bridge`
  - `ChatGPT tab`
  - `Local Codex session`
  - `Start loop`
  - `Needs approval`
  - `Allow once`
  - `Connect this chat`

## Why

Early users should not have to understand every internal concept before trying the project.

AegisLoop still keeps the same safety model:

- local config owns authority;
- web content cannot choose local sessions or workspaces;
- same-workspace Codex jobs are serialized;
- risky payloads can be blocked before local execution;
- turn results are auditable.

## Upgrade Notes

Reload the Chrome extension after pulling this version.

If the extension panel still shows an older version, open `chrome://extensions`, reload the unpacked extension, then refresh the ChatGPT tab.
