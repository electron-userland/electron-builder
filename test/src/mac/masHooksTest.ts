import { PlatformType } from "app-builder-lib/internal"
import { SigningResult } from "app-builder-lib"
import { log } from "builder-util"
import { Arch, Platform } from "electron-builder"
import * as path from "path"
import { vi } from "vitest"
import { CheckingMacPackager } from "../helpers/CheckingPackager.js"
import { assertPack } from "../helpers/packTester.js"

// Regression tests for #9997: the MAS flow packs with `sign: false` and codesigns in
// `packMasTargets`, bypassing `doSignAfterPack` — the only other `emitAfterSign` site — so the
// `afterSign` hook silently stopped firing for mas/mas-dev builds. The hook must fire exactly once,
// after codesigning and before the installer .pkg is created; when signing is skipped, the standard
// "skipping afterSign" warning must be logged instead.
describe.ifNotWindows("mas hooks", () => {
  class SignedMasPackager extends CheckingMacPackager {
    readonly events: Array<string> = []

    // stub the main signing method: on non-mac hosts isSignAllowed() would short-circuit it
    protected sign(_appPath: string, _arch: Arch, _targetPlatform: PlatformType): Promise<SigningResult> {
      this.events.push("sign")
      return Promise.resolve("signed")
    }

    protected createMasInstaller(_appPath: string, _outDir: string, _arch: Arch, _targetPlatform: PlatformType): Promise<void> {
      this.events.push("installer")
      return Promise.resolve()
    }
  }

  class UnsignedMasPackager extends CheckingMacPackager {
    readonly events: Array<string> = []

    protected sign(_appPath: string, _arch: Arch, _targetPlatform: PlatformType): Promise<SigningResult> {
      this.events.push("sign-skipped")
      return Promise.resolve("skipped:no-certificate")
    }

    protected createMasInstaller(_appPath: string, _outDir: string, _arch: Arch, _targetPlatform: PlatformType): Promise<void> {
      this.events.push("installer")
      return Promise.resolve()
    }
  }

  test("afterSign fires for mas after signing and before the installer is created", ({ expect }) => {
    let packager: SignedMasPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: Platform.MAC.createTarget("mas", Arch.x64),
        platformPackagerFactory: info => (packager = new SignedMasPackager(info)),
        config: {
          afterSign: context => {
            packager!.events.push(`afterSign:${context.electronPlatformName}:${path.basename(context.appOutDir)}`)
            return Promise.resolve()
          },
        },
      },
      {
        packed: () => {
          // the hook must fire exactly once, after codesigning and before the .pkg installer exists
          expect(packager!.events).toEqual(["sign", "afterSign:mas:mas", "installer"])
          return Promise.resolve()
        },
      }
    )
  })

  test("afterSign fires for mas-dev and no installer is created", ({ expect }) => {
    let packager: SignedMasPackager | null = null
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: Platform.MAC.createTarget("mas-dev", Arch.x64),
        platformPackagerFactory: info => (packager = new SignedMasPackager(info)),
        config: {
          afterSign: context => {
            packager!.events.push(`afterSign:${context.electronPlatformName}:${path.basename(context.appOutDir)}`)
            return Promise.resolve()
          },
        },
      },
      {
        packed: () => {
          // mas-dev codesigns (so afterSign still fires) but produces no installer .pkg
          expect(packager!.events).toEqual(["sign", "afterSign:mas:mas-dev"])
          return Promise.resolve()
        },
      }
    )
  })

  test("afterSign is skipped with a warning when mas signing does not occur", ({ expect }) => {
    let packager: UnsignedMasPackager | null = null
    const warn = vi.spyOn(log, "warn")
    return assertPack(
      expect,
      "test-app-one",
      {
        targets: Platform.MAC.createTarget("mas", Arch.x64),
        platformPackagerFactory: info => (packager = new UnsignedMasPackager(info)),
        config: {
          afterSign: () => {
            packager!.events.push("afterSign")
            return Promise.resolve()
          },
        },
      },
      {
        packed: () => {
          // no signing → no afterSign, no installer — only the standard warning
          expect(packager!.events).toEqual(["sign-skipped"])
          expect(warn.mock.calls.some(call => String(call[1]).includes(`skipping "afterSign" hook as no signing occurred`))).toBe(true)
          return Promise.resolve()
        },
      }
    ).finally(() => warn.mockRestore())
  })
})
