# AegisLoop v0.3.23

## Console Recovery Checks

- Local console and extension identities are now unique to each page instance. Browser tab duplication can copy sessionStorage; neither surface reuses a stored client ID.
- A reload gets a fresh identity and waits for the previous leader lease to expire (15 seconds by default). Pending results remain on the bridge and can be recovered without running the task again.
- Recovery, ACK, and NACK controls check authentication, leader ownership, pending-result state, and active execution. Stale handlers also check these conditions before sending writes.
- Leader-conflict responses now display the structured error name.
- Added a real Playwright browser fixture for copied storage, two-page leader conflicts, rejected ACK, expired sessions, and reload recovery. CI runs it in Chromium alongside the existing Windows, macOS, and Linux checks.

## Verification

`npm run check` includes the runtime and real-server recovery regressions. `npm run test:ui:browser` runs the browser fixture with Playwright 1.62.1 available on Node's module search path and its Chromium browser installed. CI installs those test-only dependencies outside the checkout. Set `AEGISLOOP_TEST_BROWSER=chrome` or `msedge` to use an installed channel.

The browser fixture uses the shipped local-console HTML, CSS, and JavaScript with a fake bridge. It does not prove signed-in ChatGPT model compatibility or execute real Codex tasks.

## Help Test

On a disposable sample workspace, use the console in two tabs and confirm the second tab cannot control an active leader's result. Reload the first tab, wait for the lease to expire, and recover the pending result once. Report OS, browser, AegisLoop version, and pass/partial/blocked in [the tester recruitment issue](https://github.com/MHW888888/aegisloop/issues/34). Omit tokens, private paths, session IDs, and private task text.
