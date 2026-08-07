# AegisLoop v0.3.20

## App Server Capability Guard

This release prepares the future Codex App Server adapter without switching the tested executor path prematurely.

### What changed

- `npm run doctor` now reports whether the installed Codex CLI supports:
  - App Server JSON Schema generation;
  - TypeScript binding generation;
  - the local `stdio://` transport;
  - Unix-socket transport;
  - experimental WebSocket transport and its authentication flags.
- The App Server roadmap now requires the official `initialize` / `initialized` handshake and version-matched generated schemas.
- The roadmap selects local stdio JSONL as the first adapter transport. Experimental WebSocket transport is not enabled automatically.
- Future browser surfaces are explicitly prohibited from receiving App Server account credentials or raw bridge tokens.

### Why

Official Codex documentation describes App Server as the interface for deep product integrations, while `codex exec --json --output-schema` remains the supported structured non-interactive path. App Server-generated schemas are specific to the installed Codex version, so a safe migration must probe and pin capabilities instead of assuming one protocol shape.

### Verification

Run:

```powershell
npm run check
npm run doctor
```

The current CLI executor remains the default until an App Server adapter passes lifecycle, cancellation, approval, authentication, schema-compatibility, and crash-recovery fixtures on Windows, macOS, and Linux.
