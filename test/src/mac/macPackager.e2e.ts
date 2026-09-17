import { createTargets, Platform } from "electron-builder"
import * as fs from "fs/promises"
import * as path from "path"
import { assertPack } from "../helpers/packTester"

// Full-build copy of macPackagerTest.ts "two-package": builds dmg + zip for x64, arm64 and universal and asserts the
// artifact list (artifactName macros incl. ${os}/${arch}, blockmaps, multi-arch latest-mac.yml) via the snapshot.
// The unit-level original stops after the app bundles are assembled (afterPackTestHook).
describe("macPackager", { sequential: true }, () => {
  test.ifMac("two-package (e2e)", ({ expect }) =>
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
            sign: { timestamp: undefined },
            notarize: false,
          },
          dmg: {
            title: "Foo1",
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
        signedMac: true,
        checkMacApp: async appDir => {
          const resources = await fs.readdir(path.join(appDir, "Contents", "Resources"))
          expect(resources.filter(it => !it.startsWith(".")).sort()).toMatchSnapshot()

          const electronFrameworkResources = await fs.readdir(path.join(appDir, "Contents", "Frameworks", "Electron Framework.framework", "Resources"))
          expect(electronFrameworkResources.filter(it => !it.startsWith(".")).sort()).toMatchSnapshot()
        },
      }
    )
  )
})
