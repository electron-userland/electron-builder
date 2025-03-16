import { defineConfig } from "vitest/config"
import fs from "fs"
import path from "path"

export default () => {
  const testRegex = process.env.TEST_FILES?.split(",") ?? ["*Test"]
  const includeRegex = `(${testRegex.join("|")})`
  console.log("TEST_FILES pattern", includeRegex)

  return defineConfig({
    resolve: {
      alias: {
        '@test': path.resolve(__dirname, './test/src'),
      },
    },
    server: {
      https: {
        cert: fs.readFileSync("./.vitest-cert/cert.pem"),
        key: fs.readFileSync("./.vitest-cert/key.pem"),
      },
    },
    test: {
      // Use instead: import { test, describe } from "@test/vitest/vitest-test-wrapper"
      globals: false,

      setupFiles: "./test/src/vitest/vitest-setup.ts",
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",

      // Note: only implemented isolated workers
      // pool: './test/src/vitest/vitest-fork-runner.ts',
      sequence: {
        concurrent: true
      },
      disableConsoleIntercept: true,

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
      testTimeout: 8 * 60 * 1000, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware

      resolveSnapshotPath: (testPath, snapshotExtension) => {
        return testPath
          .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
          .replace("/src/", "/snapshots/")
          .replace("\\src\\", "\\snapshots\\")
      },
    },
  })
}
