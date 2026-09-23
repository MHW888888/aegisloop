# v0.3.24 - Connection and Run Clarity

## Fixes

- Lock the conversation and task inputs while running or recovering. Pause targets the active run even if a stale selection event arrives.
- Reject empty task input and placeholder bindings before arming; guard handlers as well as buttons against overlapping execution.
- Retry transient result reads at most three times. Never replay dispatch or ACK automatically. Stop immediately on authentication or leader conflicts.
- Match result job identity before acknowledging. Reject malformed JSON, failed response envelopes, and missing control acknowledgements.
- Keep failed execution/control status visible instead of overwriting it with Ready. Add a session reconnect link and a competing-tab lease countdown.
- Give run controls adequate width on desktop and mobile; distinguish same-name workspaces with a short conversation identifier.

## Model Compatibility and Positioning

- Keep routing independent of model names, including GPT-6 Astra/Sol/Luna. Update optional live smoke targets and remove the stale 5.6-specific panel hint.
- Test CLI model argument preservation without changing the resumed session or structured output flags.
- Clarify the two AegisLoop entry points: local console and optional ChatGPT extension. Native Codex remains a separate route.

## Validation Scope

The browser fixture uses the shipped console with a fake local bridge. It covers real browser interactions, interrupted result polling, exact-job ACK, Pause, cloned tabs, expired auth, refresh recovery, and responsive layout. It does not execute a paid model or prove logged-in GPT-6 ChatGPT behavior. Capability probing does not prove account access to a model.

No host permissions or authentication gates changed. Keep local config, state, credentials, and workspace data out of commits. See [troubleshooting](troubleshooting.md) for recovery actions and [positioning](positioning.md) for current comparison scope.
