# Codex App Server Roadmap

AegisLoop's long-term role is a local policy, recovery, and audit layer for explicit Codex execution.

## v0.3.18 boundary

The current release keeps the CLI transport but stops treating plain stdout as the preferred protocol. It adds structured JSONL events, a result schema, a persistent job journal, and fail-closed crash recovery.

## v0.4.0 target

The next transport adapter should use Codex App Server for:

- thread start, resume, and fork;
- turn lifecycle and cancellation;
- command, file-change, MCP, and plan events;
- native approval requests;
- sandbox and approval policy configuration;
- instruction-source visibility;
- streaming progress and session health.

AegisLoop should continue to own:

- ChatGPT conversation to Codex thread binding;
- explicit arm and one-tab leader control;
- Run Capsule policy;
- local approval UI;
- result delivery and recovery;
- audit and sanitized debug snapshots.

App Server work should land as a separate adapter. It must not remove the tested CLI adapter until migration, cancellation, approval, and recovery fixtures pass on Windows, macOS, and Linux.

## Official Codex references

- [Non-interactive mode and JSONL output](https://developers.openai.com/codex/noninteractive/)
- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Project instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Codex Hooks](https://developers.openai.com/codex/hooks/)
