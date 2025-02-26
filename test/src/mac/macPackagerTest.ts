import { copyOrLinkFile } from "builder-util"
import { Arch, createTargets, DIR_TARGET, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { assertThat } from "../helpers/fileAssert"
import { app, appThrows, assertPack, checkDirContents, platform } from "../helpers/packTester"
import { verifySmartUnpack } from "../helpers/verifySmartUnpack"

test.ifMac("two-package", ({ expect }) =>
  assertPack(
    expect,
    "test-app",
    {
      targets: createTargets([Platform.MAC], null, "all"),
      config: {
        extraMetadata: {
          repository: "foo/bar",
        },
        downloadAlternateFFmpeg: true,
        mac: {
          electronUpdaterCompatibility: ">=2.16",
          electronLanguages: ["bn", "en"],
          timestamp: undefined,
          notarize: false,
        },
        //tslint:disable-next-line:no-invalid-template-strings
        artifactName: "${name}-${version}-${os}-${arch}.${ext}",
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
    {
      signed: true,
      checkMacApp: async appDir => {
        const resources = await fs.readdir(path.join(appDir, "Contents", "Resources"))
        expect(resources.filter(it => !it.startsWith(".")).sort()).toMatchSnapshot()
      },
    }
  )
)

test.ifMac("one-package", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget(undefined, Arch.x64),
      config: {
        appId: "bar",
        publish: {
          provider: "generic",
          //tslint:disable-next-line:no-invalid-template-strings
          url: "https://develar.s3.amazonaws.com/test/${os}/${arch}",
        },
        downloadAlternateFFmpeg: false,
        mac: {
          // test appId per platform
          appId: "foo",
          extendInfo: {
            LSUIElement: true,
            CFBundleDocumentTypes: [
              {
                CFBundleTypeName: "Folders",
                CFBundleTypeRole: "Editor",
                LSItemContentTypes: ["public.folder"],
              },
            ],
          },
          minimumSystemVersion: "10.12.0",
          fileAssociations: [
            {
              ext: "foo",
              name: "Foo",
              role: "Viewer",
            },
            {
              ext: "boo",
              name: "Boo",
              role: "Shell",
              rank: "Owner",
              isPackage: true,
            },
            {
              ext: "bar",
              name: "Bar",
              role: "Shell",
              rank: "Default",
              // If I specify `fileAssociations.icon` as `build/foo.icns` will it know to use `build/foo.ico` for Windows?
              icon: "someFoo.ico",
            },
          ],
        },
      },
    },
    {
      signed: false,
      projectDirCreated: projectDir =>
        Promise.all([
          copyOrLinkFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "foo.icns")),
          copyOrLinkFile(path.join(projectDir, "build", "icon.icns"), path.join(projectDir, "build", "someFoo.icns")),
        ]),
      checkMacApp: async (appDir, info) => {
        await assertThat(expect, path.join(appDir, "Contents", "Resources", "foo.icns")).isFile()
        await assertThat(expect, path.join(appDir, "Contents", "Resources", "someFoo.icns")).isFile()
      },
    }
  )
)

test.ifMac("yarn two package.json w/ native module", ({ expect }) =>
  assertPack(
    expect,
    "test-app-two-native-modules",
    {
      targets: Platform.MAC.createTarget("zip", Arch.universal),
      config: {
        npmRebuild: true,
        nativeRebuilder: "sequential",
      },
    },
    {
      signed: false,
      packed: async context => await verifySmartUnpack(expect, context.getResources(Platform.MAC, Arch.universal)),
    }
  )
)

test.ifMac("electronDist", ({ expect }) =>
  appThrows(expect, {
    targets: Platform.MAC.createTarget(DIR_TARGET, Arch.x64),
    config: {
      electronDist: "foo",
    },
  })
)

test.ifWinCi("Build macOS on Windows is not supported", ({ expect }) => appThrows(expect, platform(Platform.MAC)))

test("multiple asar resources", ({ expect }) =>
  app(
    expect,
    {
      targets: Platform.MAC.createTarget("zip", Arch.x64),
      config: {
        extraResources: [
          { from: "build", to: "./", filter: "*.asar" },
          { from: "build/subdir", to: "./subdir", filter: "*.asar" },
        ],
        electronLanguages: "en",
      },
    },
    {
      signed: true,
      projectDirCreated: async projectDir => {
        await fs.mkdir(path.join(projectDir, "build", "subdir"))
        await fs.copyFile(path.join(projectDir, "build", "extraAsar.asar"), path.join(projectDir, "build", "subdir", "extraAsar2.asar"))
      },
      checkMacApp: async (appDir, info) => {
        await checkDirContents(expect, path.join(appDir, "Contents", "Resources"))
      },
    }
  ))
