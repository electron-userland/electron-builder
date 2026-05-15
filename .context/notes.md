Tests are run as `TEST_FILES="<test file name>" pnpm ci:test`
Project compiles with `pnpm compile` from workspace root
Always write vitest cases (under `test/src`) instead of using `node -e` validations, preferably organize the tests under a specific folder for a relevant platform or utility.