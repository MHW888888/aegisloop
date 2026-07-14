# Thread State Screenshots

This directory contains sanitized screenshots demonstrating the different thread states in AegisLoop.

## Available Screenshots

### 1. `needs_approval.png`
Shows a thread in the **Needs Approval** state. This state indicates that automation is paused pending human review. The screenshot demonstrates:
- The "Needs Approval" state indicator badge
- A safety notice explaining why automation is paused
- Example messages showing the approval workflow
- Visual cues that automation is waiting for human input

### 2. `frozen.png`
Shows a thread in the **Frozen** state. This state indicates that all automation has been temporarily disabled. The screenshot demonstrates:
- The "Frozen" state indicator badge
- A safety notice explaining that automation is disabled
- Example messages showing the freeze/unfreeze workflow
- Visual cues that the thread is in a safe, controlled pause

## Why These States Are Safe

Both states are designed with safety in mind:

- **Needs Approval**: Automation cannot proceed without explicit human approval. This prevents unintended automated actions and ensures proper oversight.
- **Frozen**: All automation is completely disabled. No automated actions can occur until the thread is manually unfrozen. This is the safest possible state for investigation or troubleshooting.

## Regenerating Screenshots

To regenerate these screenshots:
