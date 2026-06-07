## Development Commands
Claude can run these directly to build, test, and lint the codebase:

* **Build:** `pnpm compile` (add `--watch` flag to monitor)
* **Type-check:** `pnpm typecheck` (incremental `tsc --build`, faster than a full compile)
* **Test:** `TEST_FILES=<name of file(s), comma-separated, without extension> pnpm ci:test` (runs the unit and integration suite via Vitest)
* **Lint:** `pnpm lint` for eslint. `pnpm compile` also checks for syntax and formatting errors.
* **Validate:** `pnpm ci:validate` (lint + dependency checks + prettier — this is what CI runs before tests)
* **Format:** `pnpm prettier` (formats packages/, test/, and website/)
* **Generate schemas:** `pnpm generate:all` (JSON schema + prettier — required before committing changes to config types)

## Verification & Testing Standards
* **Test Coverage:** Always ensure adding test coverage for new features and logic flows.
* **Verification:** After making edits, Claude **must** execute `TEST_FILES=<new test filename> pnpm ci:test` to self-verify before presenting the changes.
* Tests run against TypeScript sources directly (not `dist/`) via Vitest path aliases — no compile step is needed before running tests.

## ESM Gotchas
* All packages are native ESM (`"type": "module"`). TypeScript source imports require explicit `.js` extensions (e.g., `import { x } from "./foo.js"`), even though the source file is `.ts`.
* The `./internal` subpath export (e.g., `import { x } from "app-builder-lib/internal"`) provides test-only access to APIs not in the public surface. Use it in tests instead of deep path imports.
* Node >=22.12.0 is required. A `.nvmrc` at the repo root pins the recommended dev version — run `nvm use` or `fnm use` to activate it.

## Gotchas & Guidelines
* Do not use `--force` flags; prefer safer alternatives when managing dependencies.
* Always check the console output for any deprecation warnings.
* For debugging/investigating GH issues, PRs, comments, etc. -> ALWAYS use `gh` CLI
* Never use `/tmp` for test output — use `temp/` inside the project workspace root instead.
