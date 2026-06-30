# Parallel Safe Mode

Parallel Safe Mode is for running more than one ChatGPT conversation against the same source project without letting their outputs pollute each other.

It adds a **Run Capsule** to each conversation binding.

## Why

`conversationId` separation answers "which ChatGPT tab sent this?"

It does not answer:

- which project branch this run belongs to;
- whether `F8` means one branch's `F8` or another branch's `F8`;
- where generated artifacts should be written;
- whether the source project is allowed to be modified.

Run Capsules answer those questions.

For long-running work, pair the capsule with **Dual Briefing**:

- the capsule identifies the project, branch, run, source directory, and write root;
- `inbox/GPT_THREAD_BRIEF.md` tells ChatGPT what role this thread has;
- `inbox/CODEX_EXECUTION_BRIEF.md` tells Codex what files to read, where to write, and how to verify.

See [dual-briefing.md](dual-briefing.md).

## Example

```json
{
  "conversationId": "CHATGPT_CONVERSATION_ID",
  "codexSessionId": "CODEX_SESSION_ID",
  "workspaceDir": "C:\\path\\to\\source-project",
  "fullAuto": true,
  "capsule": {
    "enabled": true,
    "projectId": "traditional-calendar-stock-explore",
    "activeBranch": "V2.4F-SX",
    "branchMeaning": "sample expansion / metadata manifest / private bridge design",
    "runId": "run-20260630-001",
    "mode": "readonly",
    "stageNamespaceRequired": true,
    "forbiddenBranchContext": ["V2.4F-ENG"]
  }
}
```

## Behavior

When `capsule.enabled=true`, AegisLoop:

- creates an external run directory under `runtimeRoot`;
- injects a Run Capsule header before the Codex prompt;
- runs Codex from the external write root in `readonly` mode;
- tells Codex to treat `workspaceDir` as source-only;
- blocks prompts that mention ambiguous stage labels without the active branch namespace;
- blocks prompts that explicitly use a forbidden branch context.

## Runtime Layout

```text
C:\AegisLoopRuntime\
  runs\
    traditional-calendar-stock-explore\
      V2.4F-SX\
        run-20260630-001\
          capsule.json
          inbox\
            GPT_THREAD_BRIEF.md
            CODEX_EXECUTION_BRIEF.md
            RESEARCH_RULES.md
            FROZEN_BRANCHES.md
            CURRENT_OBJECTIVE.md
          outbox\
          patches\
```

## Current Limits

This is a prompt-level and cwd-level guard, not an operating-system sandbox.

For stronger isolation, use a separate repo copy, VM, container, or git worktree. Parallel Safe Mode is still useful because it gives every run a branch namespace and external output root before Codex starts.
