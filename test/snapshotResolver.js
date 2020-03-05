module.exports = {
  resolveSnapshotPath: (testPath, snapshotExtension) => {
    return testPath
      .replace(/\.[tj]s$/, `.js${snapshotExtension}`)
      .replace("/src/", "/snapshots/")
      .replace("\\src\\", "\\snapshots\\")
  },

  resolveTestPath: (snapshotFilePath, snapshotExtension) => {
    return snapshotFilePath
      .replace(`.js${snapshotExtension}`, ".ts")
      .replace("/snapshots/", "/src/")
      .replace("\\snapshots\\", "\\src\\")
  },

  testPathForConsistencyCheck: "src/test.ts",
}