import { defineConfig } from "vitest/config"
import fs from "fs"

export default () => {
  const testRegex = process.env.TEST_FILES?.split(",") ?? ["*Test"]
  const includeRegex = `(${testRegex.join("|")})`
  console.log("TEST_FILES pattern", includeRegex)

  const isWindows = process.platform === "win32"

  return defineConfig({
    server: {
      https: {
        cert: fs.readFileSync("./.vitest-cert/cert.pem"),
        key: fs.readFileSync("./.vitest-cert/key.pem"),
      },
    },
    test: {
      globals: true,
      setupFiles: "./test/vitest-setup.ts",
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",
      printConsoleTrace: true,

      name: "node",
      environment: "node",

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

      slowTestThreshold: 20 * 1000,
      testTimeout: (isWindows ? 8 : 5) * 1000 * 60, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware
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
