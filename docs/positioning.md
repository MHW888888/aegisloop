# Positioning and Alternatives

Checked against primary project documentation on 2026-09-23. This is a scope comparison, not a performance benchmark or an exhaustive market survey.

**AegisLoop: local Codex control with bounded runs, crash recovery, and auditable results.**

Keep the project name stable. Do not attach a model generation to it: ChatGPT model labels change independently of the local execution route. Describe concrete behavior instead of claiming a complete security sandbox or universal model compatibility.

## Adjacent Projects

| Project | Documented focus | Implication for AegisLoop |
| --- | --- | --- |
| [Happy](https://github.com/slopus/happy) | Mobile/web access to Codex and Claude Code, encryption and voice | A generic remote-control client is not our differentiator. |
| [Harnss](https://github.com/OpenSource03/harnss) | Desktop multi-agent interface, tool visualization, MCP and development tools | Do not compete by copying a full desktop environment. |
| [CloudCLI](https://github.com/siteboon/claudecodeui) | Web/mobile session and project management across coding agents | Prioritize local run correctness over another broad chat UI. |
| [Codex](https://learn.chatgpt.com/docs/non-interactive-mode) | Native execution and structured non-interactive workflows | Build on supported executor interfaces; do not replace native tools with fragile UI imitation. |

These descriptions come from the projects' own documentation. They do not establish that another project lacks recovery or security controls, and we have not benchmarked their implementations.

## A Narrow, Measurable Advantage

AegisLoop can aim to be particularly good at one workflow: an explicitly bounded task whose execution and result delivery remain understandable after interruption. Current foundations include turn-bound dispatch, a per-route leader lease, persistent job reconciliation, and exact-result acknowledgement. They are not OS isolation.

Acceptance targets for further work:

- Interrupt each execution/delivery boundary; report whether the same job is pending, acknowledged, or requires human reconciliation. Never silently rerun uncertain side effects.
- Demonstrate no duplicate execution or delivery across two tabs, refresh, and bridge restart in reproducible fault-injection tests.
- Publish a small, sanitized end-to-end demo and the test environment alongside claims.
- Implement the [App Server adapter roadmap](app-server-roadmap.md) and patch-only/worktree review before advertising them as available.

Beating alternatives on these measured properties is a plausible goal. Overall superiority is unproven; mobile access, collaboration, and native integrations are different priorities.
