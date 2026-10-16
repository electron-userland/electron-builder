# Test file classes: `*Test.ts` vs `*.e2e.ts`
Packaging tests that need the built installer/archive (mount the dmg, list the nupkg, read `latest.yml`, run the
installer under wine, …) live in `*.e2e.ts` files, next to the `*Test.ts` file of the same area (e.g.
`windows/oneClickInstallerTest.ts` + `windows/oneClickInstaller.e2e.ts`). Everything in a `*Test.ts` file stops once the
app directory is assembled (a `dir` target, `afterPackTestHook`, `effectiveOptionComputed`, or a thrown configuration
error). Generated toolset suites opt in with `e2e: true` in their `SuiteConfig` and are emitted as `<suite>__<dims>__e2e.ts`
(or `<suite>__<dims>.win.e2e.ts` when platform-gated).

`TEST_MODE` selects the class: `all` (default; CI runs both on every PR and master commit), `unit` or `e2e`. `TEST_FILES`
is a substring override and always wins over the mode. Snapshots follow the file name: `foo.e2e.ts` →
`test/snapshots/.../foo.e2e.js.snap`.

# Inspect output if test uses temporary directory
Set environment variable `TEST_APP_TMP_DIR` (e.g. `/tmp/electron-builder-test`).
Specified directory will be used instead of random temporary directory and *cleared* on each run.

## Test Code Signing Ceritificates
If test installer certificate is expired: http://security.stackexchange.com/questions/17909/how-to-create-an-apple-installer-package-signing-certificate