## Development Commands
Claude can run these directly to build, test, and lint the codebase:

* **Build:** `pnpm compile` (add `--watch` flag to monitor)
* **Test:** `TEST_FILES<name of file(s), comma-separated, without extension> pnpm ci:test` (Runs the unit and integration suite)
* **Lint:** `pnpm ci:validate`

## Verification & Testing Standards
* **Test Coverage:** Always ensure adding test coverage for new features and logic flows.
* **Verification:** After making edits, Claude **must** execute `TEST_FILES=<new test filename> pnpm ci:test` to self-verify before presenting the changes.

## Gotchas & Guidelines
* Do not use `--force` flags; prefer safer alternatives when managing dependencies.
* Always check the console output for any deprecation warnings.
* For debugging/investigating GH issues, PRs, comments, etc. -> ALWAYS use `gh` CLI
