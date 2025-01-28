import { defineConfig } from "vitest/config"

export default () => {
  const testRegex = process.env.TEST_FILES?.split(",") ?? ["*Test"]
  const includeRegex = `(${testRegex.join("|")})`
  return defineConfig({
    test: {
      globals: true,
      setupFiles: "./test/vitest-setup.ts",
      include: [`test/src/**/${includeRegex}.ts`],
      update: process.env.UPDATE_SNAPSHOT === "true",
      name: "node",
      environment: "node",
      testTimeout: 20000,
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
