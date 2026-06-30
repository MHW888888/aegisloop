# Frozen Branches

Frozen branches are preserved for audit but must not be continued by this runner.

## Frozen Contexts

| Context | Last accepted state | Rule |
| --- | --- | --- |
| `FROZEN_BRANCH_OR_PROJECT` | `LAST_ACCEPTED_STATE` | Do not read as prerequisite, continue, modify, or cite as active context. |

## What Frozen Means

- Do not use frozen outputs as accepted prerequisites for this active branch.
- Do not write new outputs into the frozen branch.
- Do not generate next-step prompts for the frozen branch.
- If ChatGPT asks to continue a frozen branch, stop and ask for explicit branch clarification.
