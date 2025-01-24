import { Arch, Platform } from "electron-builder"
import * as fs from "fs/promises"
import { app, appThrows, execShell, getTarExecutable } from "../helpers/packTester"
import { outputFile } from "fs-extra"
import { join } from "path"

test.ifNotWindows(
  "deb",
  app({
    targets: Platform.LINUX.createTarget("deb"),
  })
)

test.ifNotWindows("arm", app({ targets: Platform.LINUX.createTarget("deb", Arch.armv7l, Arch.arm64) }))

test.ifNotWindows(
  "custom depends",
  app({
    targets: Platform.LINUX.createTarget("deb"),
    config: {
      linux: {
        executableName: "Boo",
      },
      deb: {
        depends: ["foo"],
      },
    },
  })
)

test.ifNotWindows(
  "top-level exec name",
  app({
    targets: Platform.LINUX.createTarget("deb"),
    config: {
      productName: "foo",
      executableName: "Boo",
    },
  })
)

test.ifNotWindows(
  "no quotes for safe exec name",
  app({
    targets: Platform.LINUX.createTarget("deb"),
    config: {
      productName: "foo",
      linux: {
        executableName: "Boo",
      },
    },
    effectiveOptionComputed: async it => {
      const content = await fs.readFile(it[1], "utf8")
      expect(content).toMatchSnapshot()
      return false
    },
  })
)

test.ifNotWindows.ifAll(
  "executable path in postinst script",
  app(
    {
      targets: Platform.LINUX.createTarget("deb"),
      config: {
        productName: "foo",
        linux: {
          executableName: "Boo",
        },
      },
    },
    {
      packed: async context => {
        const postinst = (
          await execShell(`ar p '${context.outDir}/TestApp_1.1.0_amd64.deb' control.tar.gz | ${await getTarExecutable()} zx --to-stdout ./postinst`, {
            maxBuffer: 10 * 1024 * 1024,
          })
        ).stdout
        expect(postinst.trim()).toMatchSnapshot()
      },
    }
  )
)

test.ifNotWindows.ifAll(
  "deb file associations",
  app(
    {
      targets: Platform.LINUX.createTarget("deb"),
      config: {
        fileAssociations: [
          {
            ext: "my-app",
            name: "Test Foo",
            mimeType: "application/x-example",
          },
        ],
      },
    },
    {
      packed: async context => {
        const mime = (
          await execShell(`ar p '${context.outDir}/TestApp_1.1.0_amd64.deb' data.tar.xz | ${await getTarExecutable()} Jx --to-stdout ./usr/share/mime/packages/testapp.xml`, {
            maxBuffer: 10 * 1024 * 1024,
          })
        ).stdout
        expect(mime.trim()).toMatchSnapshot()
      },
    }
  )
)

test.ifNotWindows(
  "electron fuses + test V8 snapshot",
  app(
    {
      targets: Platform.LINUX.createTarget("deb"),
      config: {
        electronFuses: {
          runAsNode: true,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: true,
          enableNodeCliInspectArguments: true,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: {
            mainProcessSnapshotPath: "test-snapshot.bin",
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
test.ifNotWindows(
  "electron `loadBrowserProcessSpecificV8Snapshot` fuse - V8 snapshot not found",
  appThrows({
    targets: Platform.LINUX.createTarget("deb"),
    config: {
      electronFuses: {
        loadBrowserProcessSpecificV8Snapshot: {
          mainProcessSnapshotPath: undefined,
          browserProcessSnapshotPath: "test-snapshot.bin",
        },
      },
    },
  })
)
