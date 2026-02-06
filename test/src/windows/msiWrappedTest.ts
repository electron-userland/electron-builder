import { Arch, Platform } from "electron-builder"
import { XMLParser } from "fast-xml-parser"
import * as fs from "fs"
import { app, appThrows } from "../helpers/packTester"

const parser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseTagValue: true,
})

const wrappedTarget = Platform.WINDOWS.createTarget(["msiWrapped", "NSIS"], Arch.x64)

describe.ifWindows("msiWrapped", () => {
  test("msiWrapped requires nsis", ({ expect }) =>
    appThrows(
      expect,
      {
        targets: Platform.WINDOWS.createTarget("msiWrapped", Arch.x64),
        config: {
          appId: "build.electron.test.msi.oneClick.perMachine",
          extraMetadata: {
            // version: "1.0.0",
          },
          productName: "Test MSI",
          win: {
            target: ["msiWrapped"],
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
      },
      {},
      error => {
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toBe("No nsis target found! Please specify an nsis target")
      }
    ))

  test("msiWrapped allows capitalized nsis target", ({ expect }) =>
    app(
      expect,
      {
        targets: wrappedTarget,
        config: {
          appId: "build.electron.test.msi.oneClick.perMachine",
          extraMetadata: {
            // version: "1.0.0",
          },
          productName: "Test MSI",
          win: {
            target: ["msiWrapped", "NSIS"],
          },
        },
      },
      {}
    ))

  test("msiWrapped includes packaged exe", ({ expect }) =>
    app(expect, {
      targets: wrappedTarget,
      config: {
        appId: "build.electron.test.msi.oneClick.perMachine",
        extraMetadata: {
          // version: "1.0.0",
        },
        productName: "MSIWrappingEXE",
        win: {
          target: ["msiWrapped", "nsis"],
        },
        msiProjectCreated: async path => {
          const msiContents = await fs.promises.readFile(path, "utf8")

          const contents = parser.parse(msiContents)

          expect(contents["Wix"]["Product"]["Binary"]["@_SourceFile"]).toMatch(/^.*\.(exe|EXE)/)
          expect(contents["Wix"]["Product"]["InstallExecuteSequence"]).toBeTruthy()
        },
      },
    }))

  test("msiWrapped impersonate no if not provided", ({ expect }) =>
    app(expect, {
      targets: wrappedTarget,
      config: {
        appId: "build.electron.test.msi.oneClick.perMachine",
        extraMetadata: {
          // version: "1.0.0",
        },
        productName: "MSIWrappingEXE",
        win: {
          target: ["msiWrapped", "nsis"],
        },
        msiProjectCreated: async path => {
          const msiContents = await fs.promises.readFile(path, "utf8")

          const contents = parser.parse(msiContents)

          expect(contents["Wix"]["Product"]["CustomAction"]["@_Impersonate"]).toEqual("no")
        },
      },
    }))

  test("msiWrapped impersonate yes if true", ({ expect }) =>
    app(expect, {
      targets: wrappedTarget,
      config: {
        appId: "build.electron.test.msi.oneClick.perMachine",
        extraMetadata: {
          // version: "1.0.0",
        },
        productName: "MSIWrappingEXE",
        win: {
          target: ["msiWrapped", "nsis"],
        },
        msiWrapped: {
          impersonate: true,
        },
        msiProjectCreated: async path => {
          const msiContents = await fs.promises.readFile(path, "utf8")

          const contents = parser.parse(msiContents)

          expect(contents["Wix"]["Product"]["CustomAction"]["@_Impersonate"]).toEqual("yes")
        },
      },
    }))

  test("msiWrapped wrappedInstallerArgs provided", ({ expect }) =>
    app(expect, {
      targets: wrappedTarget,
      config: {
        appId: "build.electron.test.msi.oneClick.perMachine",
        extraMetadata: {
          // version: "1.0.0",
        },
        productName: "MSIWrappingEXE",
        win: {
          target: ["msiWrapped", "nsis"],
        },
        msiWrapped: {
          wrappedInstallerArgs: "/currentuser /S /wut",
        },
        msiProjectCreated: async path => {
          const msiContents = await fs.promises.readFile(path, "utf8")

          const contents = parser.parse(msiContents)

          expect(contents["Wix"]["Product"]["CustomAction"]["@_ExeCommand"]).toEqual("/currentuser /S /wut")
        },
      },
    }))
})
