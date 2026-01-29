import { defineConfig } from "vitest/config"
import fs from "fs"
import isCI from "is-ci"

export default () => {
  const testRegex = process.env.TEST_FILES?.split(",") ?? ["*Test", "*test"]
  const includeRegex = `(${testRegex.join("|")})`
  console.log("TEST_FILES pattern", includeRegex)

  return defineConfig({
    server: {
      https: {
        cert: fs.readFileSync("./.vitest-cert/cert.pem"),
        key: fs.readFileSync("./.vitest-cert/key.pem"),
      },
    },
    test: {
      // if using `toMatchSnapshot`, it MUST be passed in through the test context
      // e.g. test("name", ({ expect }) => { ... })
      globals: true,
      allowOnly: !isCI,
      expandSnapshotDiff: process.env.SNAPSHOT_DIFF === "true",

      setupFiles: "./test/vitest-setup.ts",
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",

      name: "node",
      environment: "node",
      printConsoleTrace: true,

      server: {
        deps: {
          inline: ["electron"],
        },
      },

      deps: {
        optimizer: {
          web: {
            enabled: true,
          },
        },
      },

      slowTestThreshold: 60 * 1000,
      // disk operations can be slow. We're generous with the timeout here to account for less-performant (local?) machines.
      // GH runners are fast, but we're still running tests concurrently, so collectively, they take less time, but individually, they can take longer due to parallelism.
      testTimeout: 15 * 60 * 1000,
      sequence: {
        concurrent: process.env.TEST_SEQUENTIAL !== "true",
      },

      coverage: {
        reporter: ["lcov", "text"],
      },
      reporters: ["default", "html"],
      outputFile: "coverage/sonar-report.xml",
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
