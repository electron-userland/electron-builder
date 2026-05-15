Tests are run as `TEST_FILES="<test file name>" pnpm ci:test`.
Project compiles with `pnpm compile` from workspace root.
Prioritize always writing vitest cases under `test/src`, preferably organized under a specific folder for a relevant platform.
Use `gh` CLI wherever appropriate instead of WebFetch.
Do not ever commit and push, or write/update a PR, while using `gh`.