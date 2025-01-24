import { Platform } from "electron-builder"
import { app } from "../helpers/packTester"
import { outputFile } from "fs-extra"
import { join } from "path"

test.ifAll.ifNotWindows.ifDevOrLinuxCi(
  "tar",
  app(
    {
      targets: Platform.LINUX.createTarget(["tar.xz", "tar.lz", "tar.bz2"]),
      config: {
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: true,
          enableNodeCliInspectArguments: true,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: {
            mainProcessSnapshotPath: undefined,
            browserProcessSnapshotPath: "test-snapshot.bin",
          },
          grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
        },
      },
    },
    {
      projectDirCreated: async projectDir => outputFile(join(projectDir, "build", "test-snapshot.bin"), "data"),
    }
  )
)
