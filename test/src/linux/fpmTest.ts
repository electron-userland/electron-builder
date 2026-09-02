import { Arch, Platform } from "electron-builder"
import FpmTarget from "app-builder-lib/src/targets/linux/FpmTarget"
import { app, EXTENDED_TIMEOUT } from "../helpers/packTester.js"

describe("fpm default depends", () => {
  test("pacman does not depend on AUR-only packages", ({ expect }) => {
    // https://github.com/electron-userland/electron-builder/issues/9429
    // `http-parser` is not available in the official Arch repositories (AUR-only),
    // so including it by default made pacman packages uninstallable on stock Arch.
    const defaults: string[] = FpmTarget.prototype["getDefaultDepends"].call(null, "pacman")
    expect(defaults).not.toContain("http-parser")
  })

  test(`"default" in depends expands in place to the target's default list`, ({ expect }) => {
    const fpmTarget: any = Object.create(FpmTarget.prototype)
    for (const target of ["deb", "rpm", "pacman"]) {
      const defaults: string[] = fpmTarget["getDefaultDepends"](target)
      const expanded: string[] = fpmTarget["expandDependsDefaults"](["default", "foo"], target)
      expect(expanded).toEqual([...defaults, "foo"])
      expect(expanded).not.toContain("default")
    }
  })

  test(`"default" expansion dedupes the final list`, ({ expect }) => {
    const fpmTarget: any = Object.create(FpmTarget.prototype)
    const defaults: string[] = fpmTarget["getDefaultDepends"]("pacman")
    const expanded: string[] = fpmTarget["expandDependsDefaults"](["default", defaults[0], "foo", "foo"], "pacman")
    expect(expanded).toEqual([...defaults, "foo"])
  })
})

// "apk" is very slow, don't test for now
describe.heavy.ifNotWindows("fpm", () => {
  test("targets", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(expect, {
      targets: Platform.LINUX.createTarget(["sh", "freebsd", "pacman", "zip", "7z"], Arch.x64),
      config: {
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

  // https://github.com/electron-userland/electron-builder/issues/460
  // for some reasons in parallel to fmp we cannot use tar
  test("rpm and tar.gz", { timeout: EXTENDED_TIMEOUT }, ({ expect }) =>
    app(expect, {
      targets: Platform.LINUX.createTarget(["rpm", "tar.gz"], Arch.x64),
      config: {
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
})
