import isCI from "is-ci"
import { defineConfig } from "vitest/config"
import SmartSequencer from "./test/vitest-scripts/vitest-smart-sequencer"

export default async () => {
  const testFilePattern = process.env.TEST_FILES?.trim() || "*Test,*test"
  const testRegex = testFilePattern?.split(",")
  const includeRegex = `(${testRegex.join("|")})`
  console.log("TEST_FILES pattern", includeRegex)

  return defineConfig({
    server: {
      open: false,
    },
    test: {
      // if using `toMatchSnapshot`, it MUST be passed in through the test context
      // e.g. test("name", ({ expect }) => { ... })
      // we manually set `globalThis.test` and `globalThis.describe` in vitest-setup.ts to make sure everything works correctly
      globals: false,

      allowOnly: !isCI, // Prevent accidental commit of `test.only` in CI
      printConsoleTrace: true,

      // Allow test metadata
      includeTaskLocation: true,
      setupFiles: [
        "./test/vitest-scripts/vitest-setup.ts",
        "./test/vitest-scripts/vitest-heavy-mutex.ts",
      ],
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",

      reporters: [
        'default',
        "./test/vitest-scripts/vitest-smart-reporter"
      ],

      maxWorkers: '50%',
      minWorkers: 1,

      // Ensure tests from different files can run in parallel
      // but heavy tests will be serialized by the mutex
      fileParallelism: true,
      sequence: {
        sequencer: SmartSequencer,
        concurrent: process.env.TEST_SEQUENTIAL !== "true",
      },

      slowTestThreshold: 2 * 60 * 1000,
      testTimeout: 10 * 60 * 1000, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware

      snapshotFormat: {
        printBasicPrototype: false,
      },
      resolveSnapshotPath: (testPath, snapshotExtension) => {
        return testPath
          .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
          .replace("/src/", "/snapshots/")
          .replace("\\src\\", "\\snapshots\\")
      },
    },
  })
}
