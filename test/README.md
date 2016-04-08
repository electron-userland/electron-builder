In addition to [required system packages](./multi-platform-build.md), on OS X `dpkg` is required to run Linux tests: `brew install dpkg`

# Inspect output if test uses temporary directory
Set environment variable `TEST_APP_TMP_DIR` (e.g. `/tmp/electron-builder-test`).
Specified directory will be used instead of random temporary directory and *cleared* on each run.