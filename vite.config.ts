import { defineConfig } from "vitest/config"

export default () => {
  return defineConfig({
    test: {
      globals: true,
      setupFiles: "./test/vitest-setup.ts",
      include: ["test/src/**/macPackagerTest.?(c|m)[jt]s?(x)"],
      update: process.env.UPDATE_SNAPSHOT === "true",
      name: "node",
      environment: "node",
      testTimeout: 20000,
      snapshotFormat: {
        // printBasicPrototype: true, // retain Jest snapshot format for now to reduce diff of PR
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
