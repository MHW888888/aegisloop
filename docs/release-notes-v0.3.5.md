# v0.3.5 - Unicode Runtime Segment Fix

This patch fixes a Run Capsule path compatibility issue found during self-review.

## Fixed

- `projectId`, `activeBranch`, and `runId` no longer collapse to fallback values when they contain Unicode text such as Chinese names.
- Unsafe path characters are still replaced before building runtime folders.
- Reserved Windows device names such as `CON` and `NUL` are guarded with a safe suffix.

## Verified

- Added `scripts/test-unicode-runtime.js` and included it in `npm run check`.
- Bridge startup under a Unicode temp path.
- Token-protected `/api/conversations`.
- `POST /api/briefing/materialize` writing briefing files under a Unicode `runtimeRoot`.
