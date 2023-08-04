import { app, appThrows } from "../helpers/packTester"
import { Platform } from "electron-builder"
import { XMLParser } from "fast-xml-parser"
import * as fs from "fs"

const parser = new XMLParser({
  ignoreAttributes: false,
  ignoreDeclaration: true,
  parseTagValue: true,
})

test.ifAll.ifDevOrWinCi(
  "msiWrapped requires nsis",
  appThrows(
    {
      targets: Platform.WINDOWS.createTarget("msiWrapped"),
      config: {
        appId: "build.electron.test.msi.oneClick.perMachine",
        extraMetadata: {
          // version: "1.0.0",
        },
        productName: "Test MSI",
        win: {
          target: ["msiWrapped"],
        },
      },
    },
    {},
    error => {
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe("No nsis target found! Please specify an nsis target")
    }
  )
)

test.ifAll.ifDevOrWinCi(
  "msiWrapped allows capitalized nsis target",
  app(
    {
      targets: Platform.WINDOWS.createTarget(["msiWrapped", "NSIS"]),
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
  )
)

test.ifAll.ifDevOrWinCi(
  "msiWrapped includes packaged exe",
  app({
    targets: Platform.WINDOWS.createTarget(["msiWrapped", "nsis"]),
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
  })
)

test.ifAll.ifDevOrWinCi(
  "msiWrapped impersonate no if not provided",
  app({
    targets: Platform.WINDOWS.createTarget(["msiWrapped", "nsis"]),
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
  })
)

test.ifAll.ifDevOrWinCi(
  "msiWrapped impersonate yes if true",
  app({
    targets: Platform.WINDOWS.createTarget(["msiWrapped", "nsis"]),
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
  })
)

test.ifAll.ifDevOrWinCi(
  "msiWrapped wrappedInstallerArgs provided",
  app({
    targets: Platform.WINDOWS.createTarget(["msiWrapped", "nsis"]),
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
  })
)
