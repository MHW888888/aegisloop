# AegisLoop v0.3.22

## Local UI Lease and Polling Hardening

- Changed the local console identity from shared `localStorage` to per-tab `sessionStorage`. Independently opened `/ui/` tabs no longer present the same `clientId` to the leader lease, while a reload in one tab keeps its identity.
- Added an 8-second timeout to local console requests and made status refresh single-flight, preventing stalled bridge requests from accumulating behind the six-second refresh timer.
- Disabled both run entry points when the bridge or UI session is unavailable and surfaced distinct bridge-timeout and session-expired states.
- Fixed workspace labels so Windows and POSIX paths both render a short final directory name.
- Extended `npm run doctor` capability reporting for Codex CLI builds that expose App Server daemon management and proxy commands. These are reported only; the tested structured CLI adapter remains the default.

## Safety

This release does not relax Chat Mode, API authorization, Origin checks, leader leases, exact arm and turn-token checks, pending-result locks, execution policy, or crash recovery. App Server support remains a roadmap item until its lifecycle and recovery fixtures pass on Windows, macOS, and Linux.

## Verification

The new UI runtime test covers separate tab identities, same-tab reload identity, request timeout classification, single-flight refresh, unavailable-control disabling, and Windows/POSIX workspace labels.
