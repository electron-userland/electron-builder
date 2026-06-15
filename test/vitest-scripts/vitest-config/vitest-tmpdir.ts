import { afterEach, beforeEach } from "vitest"
import { TmpDir } from "temp-file"

// Gives every test its own temp directory on the test context, cleaned up automatically:
//
//   test("writes files", async ({ tmpDir }) => {
//     const dir = await tmpDir.getTempDir()
//     ...
//   })
//
// Tests no longer need their own `new TmpDir()` plus manual cleanup. `new TmpDir()` does no I/O until a temp
// path is actually requested, and cleanup() is a no-op for tests that never touch `tmpDir`, so this stays
// cheap for the (many) tests that don't use it.
//
// Implemented with context hooks rather than vitest's `test.extend()` fixtures on purpose: registering any
// fixture makes vitest parse the first parameter of EVERY test and hook callback to detect fixture usage,
// which rejects the non-destructured `ctx`/`context` parameters this suite relies on — the heavy-mutex hooks
// in vitest-heavy-mutex.ts and the `async context => runInstallTest(context, …)` pattern in the updater tests.
// Context hooks impose no such constraint.
beforeEach(context => {
  context.tmpDir = new TmpDir(context.task.name)
})

afterEach(async context => {
  await context.tmpDir.cleanup()
})
