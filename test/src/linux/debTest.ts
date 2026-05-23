import { Arch, Platform } from "electron-builder"
import * as fs from "fs/promises"
import { app, execShell, getArExecutable, getTarExecutable, resolveDebMember } from "../helpers/packTester"

const defaultDebTarget = Platform.LINUX.createTarget("deb", Arch.x64)

describe.heavy.ifNotWindows("deb", () => {
  test("deb", ({ expect }) =>
    app(expect, {
      targets: defaultDebTarget,
    }))

  test("arm", ({ expect }) => app(expect, { targets: Platform.LINUX.createTarget("deb", Arch.armv7l, Arch.arm64) }))

  test("custom depends", ({ expect }) =>
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
    }))

  test("top-level exec name", ({ expect }) =>
    app(expect, {
      targets: defaultDebTarget,
      config: {
        productName: "foo",
        executableName: "Boo",
      },
    }))

  test("no quotes for safe exec name", ({ expect }) =>
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
    }))

  test("executable path in postinst script", ({ expect }) =>
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
          const debPath = `${context.outDir}/TestApp_1.1.0_amd64.deb`
          const { member: controlMember, tarArgs: controlArgs } = await resolveDebMember(debPath, "control.tar.")
          const postinst = (
            await execShell(`${await getArExecutable()} p '${debPath}' ${controlMember} | ${await getTarExecutable()} -x ${controlArgs} --to-stdout ./postinst`, {
              maxBuffer: 10 * 1024 * 1024,
            })
          ).stdout
          expect(postinst.trim()).toMatchSnapshot()
        },
      }
    ))

  test("deb file associations", ({ expect }) =>
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
          const debPath = `${context.outDir}/TestApp_1.1.0_amd64.deb`
          const { member: dataMember, tarArgs: dataArgs } = await resolveDebMember(debPath, "data.tar.")
          const mime = (
            await execShell(
              `${await getArExecutable()} p '${debPath}' ${dataMember} | ${await getTarExecutable()} -x ${dataArgs} --to-stdout './usr/share/mime/packages/testapp.xml'`,
              {
                maxBuffer: 10 * 1024 * 1024,
              }
            )
          ).stdout
          expect(mime.trim()).toMatchSnapshot()
        },
      }
    ))
})
