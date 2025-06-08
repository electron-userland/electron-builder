import { Arch, Platform } from "electron-builder"
import * as fs from "fs/promises"
import { app, execShell, getTarExecutable } from "../helpers/packTester"

const defaultDebTarget = Platform.LINUX.createTarget("deb", Arch.x64)

test.ifNotWindows("deb", ({ expect }) =>
  app(expect, {
    targets: defaultDebTarget,
  })
)

test.ifNotWindows("arm", ({ expect }) => app(expect, { targets: Platform.LINUX.createTarget("deb", Arch.armv7l, Arch.arm64) }))

test.ifNotWindows("custom depends", ({ expect }) =>
  app(expect, {
    targets: defaultDebTarget,
    config: {
      linux: {
        executableName: "Boo",
      },
      deb: {
        depends: ["foo"],
      },
      electronFuses: {
        runAsNode: true,
        enableCookieEncryption: true,
        enableNodeOptionsEnvironmentVariable: true,
        enableNodeCliInspectArguments: true,
        enableEmbeddedAsarIntegrityValidation: true,
        onlyLoadAppFromAsar: true,
        loadBrowserProcessSpecificV8Snapshot: true,
        grantFileProtocolExtraPrivileges: undefined, // unsupported on current electron version in our tests
      },
    },
  })
)

test.ifNotWindows("top-level exec name", ({ expect }) =>
  app(expect, {
    targets: defaultDebTarget,
    config: {
      productName: "foo",
      executableName: "Boo",
    },
  })
)

test.ifNotWindows("no quotes for safe exec name", ({ expect }) =>
  app(expect, {
    targets: defaultDebTarget,
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

test.ifNotWindows("executable path in postinst script", ({ expect }) =>
  app(
    expect,
    {
      targets: defaultDebTarget,
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

test.ifNotWindows("deb file associations", ({ expect }) =>
  app(
    expect,
    {
      targets: defaultDebTarget,
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
          await execShell(`ar p '${context.outDir}/TestApp_1.1.0_amd64.deb' data.tar.xz | ${await getTarExecutable()} Jx --to-stdout './usr/share/mime/packages/Test App ßW.xml'`, {
            maxBuffer: 10 * 1024 * 1024,
          })
        ).stdout
        expect(mime.trim()).toMatchSnapshot()
      },
    }
  )
)
