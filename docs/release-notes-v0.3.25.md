# v0.3.25 - Compact Panel and Draft Safety

## Extension Usability

- Move the panel by dragging its header or using arrow keys while the header is focused. Reset its position with a single control.
- Minimize to a compact status view with a Pause control. Minimizing is a view-only action and never changes the execution route or arm state.
- Persist only position and collapsed state in extension storage. Clamp the panel to the viewport after resize, including narrow windows.
- Fold Connection, Briefing, and Diagnostics into expandable sections. Keep run controls in a separate footer; automatically reveal connection fields when authentication or binding needs attention.
- Scope panel styles, use border-box sizing, and keep controls and text within 320-pixel viewports. No host permissions changed.

## Correctness Fixes

- Exclude all extension elements from composer/send/stop selectors. Missing ChatGPT input must not resolve to the extension's own textarea.
- Preserve existing manual drafts and drafts typed after a send. Detect input changes before clicking Send; do not bypass a disabled send button.
- Confirm by unique message identity, even if message virtualization keeps the user-message count unchanged. Attempt each send once; uncertain confirmation never triggers an automatic duplicate submission.
- Prevent overlapping Arm clicks. A manual pause or conversation change invalidates delayed seed continuation.
- Require an explicit successful control envelope, not just HTTP 200. Ignore a control reply belonging to a previous conversation.

## Verification Scope

`npm run test:extension:browser` injects the shipped content script into a synthetic ChatGPT-like page with a fake bridge relay. It covers real browser layout, drag/pointer capture, keyboard movement, reload persistence, minimize/Pause, leader restrictions, strict control errors, selector isolation, manual draft preservation, and missing-confirmation recovery without resend. It also runs the complete seed-to-dispatch-to-result-to-ACK sequence. CI runs it beside the local console browser test.

This fixture does not certify a signed-in ChatGPT model or execute a paid Codex task. Server authentication, nonce, lease, and result-consumption policies are unchanged. Reload the unpacked extension and refresh existing ChatGPT tabs to use this version.
