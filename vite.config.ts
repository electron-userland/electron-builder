import { defineConfig } from "vitest/config"

export default () => {
  const testRegex = process.env.TEST_FILES?.split(",") ?? ["*Test"]
  const includeRegex = `(${testRegex.join("|")})`
  const isWindows = process.platform === "win32"
  return defineConfig({
    build: {
      target: "node",
    },
    test: {
      globals: true,
      setupFiles: "./test/vitest-setup.ts",
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",
      name: "node",
      environment: "node",
      // pool: 'forks', // https://vitest.dev/guide/common-errors#segfaults-and-native-code-errors
      testTimeout: (isWindows ? 30 : 20) * 1000 * 60, // disk operations can be slow. We're generous with the timeout here to account for less-performant hardware
      coverage: {
        reporter: ["lcov", "text"],
      },
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
