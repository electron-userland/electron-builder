---
"app-builder-lib": minor
---

fix: return a descriptive result instead of a bare boolean from the Windows signing chain. `SignManager.signFile` now resolves to `"signed" | "signed:custom" | "skipped:no-certificate"` (failures are still thrown), and `WinPackager.signIf` extends it with `"skipped:filtered"` (excluded via `signExts`) and `"skipped:disabled"` (`sign: false`/`sign: null`), so callers and logs can distinguish why a file was not signed. Follow-up to #10082:

- The unconditional `Signing <file>...` log line is removed — the sign managers already log `signing` with certificate details right before executing, so unsigned builds no longer look like they are signing.
- The skip message now states the actual reason at info level (`signing skipped reason=no code signing certificate configured`) instead of a debug-level "no signing configuration found".
- A file signed by a custom `win.sign` hook is now logged as ``signed with custom `sign` hook`` instead of being misattributed to `signtool.exe`.
- **Behavior change**: `WinPackager.signApp` previously discarded the per-file results and returned `true` unconditionally, so the `afterSign` hook fired even for fully unsigned Windows builds. It now returns whether at least one file was actually signed — for unsigned Windows builds, `afterSign` is skipped and the standard `skipping "afterSign" hook as no signing occurred, perhaps you intended "afterPack"?` warning is logged, matching the documented gating in `doSignAfterPack` and the mas/mas-dev behavior (#10071). Builds that relied on `afterSign` firing without any signing should move that logic to `afterPack`.
