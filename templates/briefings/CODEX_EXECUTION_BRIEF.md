# AegisLoop Codex Execution Brief

Read this file before executing the task.

## Project

`PROJECT_ID`

## Active Branch

`ACTIVE_BRANCH`

## Mode

```text
research_only=true
internal_only=true
approved_for_scoring=false
```

## Source Project

Read from `source_dir` only as input.

Do not modify `source_dir`.

## Write Policy

Write all new artifacts only under `allowed_write_root`.

Do not write to forbidden paths from `capsule.json`.

If code changes are needed, generate a patch, standalone script, or report under `allowed_write_root`.

## Required Local Files

Read these before doing work:

- `capsule.json`
- `inbox/RESEARCH_RULES.md`
- `inbox/FROZEN_BRANCHES.md`
- `inbox/CURRENT_OBJECTIVE.md`

## Forbidden Outputs

- no stock code, symbol, stock name, URL, or raw identifier
- no trading advice
- no BUY/WATCH/AVOID
- no expected value unless explicitly allowed
- no scoring
- no human-facing recommendation
- no production signal

## Result Summary

The final result must include:

1. current objective understood
2. files read
3. instruction review result
4. actual work performed
5. files created or modified
6. validation commands and results
7. unresolved risks
8. next-step options for ChatGPT
9. suggested next manual prompt, if any
