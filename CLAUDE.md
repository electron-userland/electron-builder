## Development Commands
Claude can run these directly to build, test, and lint the codebase:

* **Build:** `pnpm compile` (add `--watch` flag to monitor)
* **Test:** `TEST_FILES=<name of file(s), comma-separated, without extension> pnpm ci:test` (Runs the unit and integration suite)
* **Lint:** `pnpm ci:validate`

## Verification & Testing Standards
* **Test Coverage:** Always ensure adding test coverage for new features and logic flows.
* **Verification:** After making edits, Claude **must** execute `TEST_FILES=<new test filename> pnpm ci:test` to self-verify before presenting the changes.
* **Untested guards:** Any guard or branch without a test gets a focused test that fails without it. Never drop code because it is untested. Trivial log-only moves don't need tests.
* **Temp dirs:** Get temp dirs from the vitest `tmpDir` test-context fixture (`tmpDir.getTempDir({ prefix })`), never `new TmpDir(...)`. Helpers that need one take `tmpDir: TmpDir` as a parameter.
* **Environment variables:** Never assign or delete `process.env` in tests. Use `vi.stubEnv`, or pass `env: { ...process.env, NAME }` to a spawned child process.

## Code Rules
* **Runtime safety:** `builder-util-runtime` and `electron-updater` ship inside end-user apps. No `!` non-null assertions or unchecked `as` casts there; narrow explicitly with null checks and early returns. Logging helpers must never throw.
* **Credentials and signing:** Where and how a credential or signing key is selected (publish tokens, cloud credentials, code-signing certs, update-manifest keys) must come from explicit configuration. Documented env-var inputs such as `CSC_LINK`, `GH_TOKEN` and `KEYGEN_TOKEN` count as explicit configuration; remove one only as a self-announcing breaking change. Never add ambient resolution: default profiles, keychains, SDK default provider chains, undocumented env reads or silent fallback between sources. When the configuration doesn't say, fail: throw `InvalidConfigurationError` at build time, and in `electron-updater` / `builder-util-runtime` use `newError(message, "ERR_UPDATER_...")` from `builder-util-runtime` (never import `builder-util` there).
* **Trust model:** Only the configuration is trusted. Copied project trees and the symlinks inside them are not, so check write destinations by realpath at write time, not just lexically.
* **Breaking changes announce themselves:** Plain-JS users never see type changes, so every breaking or behavior change logs a warning where the user hits it: name the version, what happens now and the replacement, and end with a link to the matching `https://www.electron.build/docs/migration/v27-*` page. Warn once per process on the builder side and once per instance in the updater. Hard errors get the same link. Never log secret values. Exceptions:
  * Validation that only rejects already-broken input is a hardening: patch changeset, documented on the feature's own docs page, no migration-page entry.
  * Security hardening states only the current rule and its opt-in, with no comparison to what earlier versions did, in errors, docs, changesets and PR text.
  * Toolset changes are documented on the website, not logged.
* **Toolsets:** Toolset resolvers copy the shape of `packages/app-builder-lib/src/toolsets/appimage.ts`: a version-to-checksum map, a `latest` alias, `system`/custom handling and asset selection. No host OS/libc sniffing, exec probes or extra guards; put platform limits in the website docs. Toolsets and their versions can be added or removed in any release without a major version bump.
* **Updater compatibility:** Gate new update-artifact formats and features on `electronUpdaterCompatibility`. Never require electron-builder and electron-updater major versions to be paired.
* **Refactors:** Split large methods into meaningful step methods, but don't extract one-call helpers or create helper modules just to unit-test them; leave small guards and clamps inline.
* **GitHub workflows and actions:** Run `zizmor` on every workflow or composite action you add or edit and fix its findings. Every `actions/setup-node` step sets `check-latest: true`. Reuse the shared composites in `.github/actions/` (`setup-node`, `pnpm`) instead of duplicating setup.

## Test Harness Gotchas
* New `assertPack` tests need artifact snapshot entries in both `<file>.js.snap` and `<file>.js.win.snap`.
* The test runner has no `-t` filter; use a temporary `.only` to run a single test.
* Regenerate lockfile fixtures with `UPDATE_LOCKFILE_FIXTURES=true`.
* Pin a fixture's package manager by setting `data.packageManager` in `projectDirCreated`; the `packageManager` assert option gets overwritten.
* Don't put `pnpm-workspace.yaml` at a fixture root when installing into a nested `app/`; the install becomes a no-op.
* changeset-bot's Type column is unreliable when a branch has several pending changesets for one package; run `changeset status` instead.

## Gotchas & Guidelines
* Do not use `--force` flags; prefer safer alternatives when managing dependencies.
* Always check the console output for any deprecation warnings.
* For debugging/investigating GH issues, PRs, comments, etc. -> ALWAYS use `gh` CLI
