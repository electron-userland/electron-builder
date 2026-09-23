/**
 * MSIX blackbox e2e tests.
 *
 * These tests build real MSIX / .msixbundle packages, install them in a
 * Parallels Windows VM (or native Windows when running on CI), and verify
 * that `Get-AppxPackage` sees the installed package and that the manifest
 * contains the expected elements.
 *
 * Skip conditions:
 * - macOS without a Parallels Windows VM  → context.skip()
 * - Linux  → context.skip()
 */

import { PM } from "app-builder-lib/src/node-module-collector/packageManager"
import { Arch, Platform } from "electron-builder"
import { move } from "fs-extra"
import * as os from "os"
import * as path from "path"
import { afterAll, beforeAll, TestContext } from "vitest"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { spawn, TmpDir } from "builder-util"
import { optionsForFlakyE2E, windowsVmPromise } from "./blackboxUpdateHelpers"
import { installMsixInVm, installMsixNative, launchMsixAppInVm, uninstallMsixInVm, uninstallMsixNative } from "./blackboxInstallMsix"
import type { MsixInstallResult } from "./blackboxInstallMsix"

// Route all electron-builder temp files through the user home directory so that
// Parallels VM can access them via the always-available \\Mac\Home share.
// APP_BUILDER_TMP_DIR is read once on first TmpDir use — set it before any tests run.
const MSIX_TEST_TMP = path.join(os.homedir(), ".eb-msix-test-tmp")
process.env.APP_BUILDER_TMP_DIR = MSIX_TEST_TMP

import { mkdirs, remove } from "fs-extra"

beforeAll(async () => {
  await mkdirs(MSIX_TEST_TMP)
})

afterAll(async () => {
  await remove(MSIX_TEST_TMP).catch(() => {})
})

// The identity name used for all MSIX e2e test packages.
// Must be unique to avoid colliding with AppX test installations.
const TEST_IDENTITY_NAME = "TestAppMsix"

// The native (non-VM) MSIX install path runs `Add-AppxPackage -AllowUnsigned` (relies on Windows
// Developer Mode) and mutates the per-user AppX package registry. It is unreliable on shared/
// Windows-Server CI runners (Developer Mode + AppX deployment service availability), so it is
// opt-in via RUN_MSIX_INSTALL_TESTS (mirroring RUN_SNAP_TESTS / DO_APPX_CERT_STORE_AWARE_TEST).
// The Parallels-VM path (macOS) is unaffected and self-skips when no VM is present.
const RUN_MSIX_INSTALL_TESTS = !!process.env.RUN_MSIX_INSTALL_TESTS

// Get-AppxPackageManifest's -Package parameter requires the PackageFullName, not the family name
// (passing the family name returns nothing). Resolve the full name from the family name first.
function manifestQueryPs(packageFamilyName: string): string {
  return `$p = Get-AppxPackage | Where-Object { $_.PackageFamilyName -eq '${packageFamilyName}' } | Select-Object -First 1; if ($p) { (Get-AppxPackageManifest -Package $p.PackageFullName).OuterXml }`
}

async function buildMsixApp(
  expect: any,
  tmpDir: TmpDir,
  target: Map<Platform, Map<Arch, Array<string>>>,
  msixConfig: object,
  packed: (ctx: PackedContext) => Promise<void>
): Promise<void> {
  await assertPack(
    expect,
    "test-app",
    {
      targets: target,
      config: {
        productName: "TestApp",
        executableName: "TestApp",
        appId: "com.test.msix",
        compression: "store",
        electronLanguages: ["en"],
        electronFuses: {
          runAsNode: false,
          enableCookieEncryption: true,
          enableNodeOptionsEnvironmentVariable: false,
          enableNodeCliInspectArguments: false,
          enableEmbeddedAsarIntegrityValidation: true,
          onlyLoadAppFromAsar: true,
          loadBrowserProcessSpecificV8Snapshot: false,
          grantFileProtocolExtraPrivileges: false,
        },
        // MSIX requires a modern toolset — winCodeSign-2.6.0 (legacy/0.0.0) does not
        // include the windows-kits-bundle-10_0_26100_0 makeappx.exe that supports .msix
        toolsets: { winCodeSign: "1.0.0" as const },
        // Pin version so artifact filenames are predictable
        extraMetadata: { name: "testapp", version: "1.0.0" },
        msix: {
          identityName: TEST_IDENTITY_NAME,
          publisherDisplayName: "Test Publisher",
          // Use hyphens — prlctl exec does not quote arguments containing spaces,
          // so spaces in artifact paths cause makeappx to receive broken arguments.
          artifactName: "${productName}-${version}-${arch}.${ext}",
          ...msixConfig,
        },
        publish: null,
      },
    },
    {
      // Build UNSIGNED: the install path uses `Add-AppxPackage -AllowUnsigned` (Developer Mode).
      // A signed package would need its self-signed cert trusted in LocalMachine\Root (UAC
      // elevation) — and -AllowUnsigned does NOT bypass an existing-but-untrusted signature
      // (0x800B0109). Signed-build coverage lives in the msix__wcs suite ("MSIX", signedWin:true).
      signedWin: false,
      packageManager: PM.PNPM,
      packed,
      projectDirCreated: async (projectDir, _dir, runtimeEnv) => {
        await modifyPackageJson(
          projectDir,
          data => {
            data.devDependencies = { electron: ELECTRON_VERSION }
          },
          true
        )
        await modifyPackageJson(
          projectDir,
          data => {
            data.pnpm = {
              supportedArchitectures: { os: ["current"], cpu: ["x64"] },
            }
          },
          false
        )
        await spawn("pnpm", ["install"], { cwd: projectDir, stdio: "inherit", env: runtimeEnv })
      },
    }
  )
}

describe.heavy("msix", optionsForFlakyE2E, () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Test 1 — single-arch .msix: build → install → verify → uninstall
  // ─────────────────────────────────────────────────────────────────────────
  test("single-arch msix installs and uninstalls via VM", optionsForFlakyE2E, async (context: TestContext) => {
    const { expect } = context
    const vm = await windowsVmPromise
    const isNativeWindows = process.platform === "win32"
    const canNativeInstall = isNativeWindows && RUN_MSIX_INSTALL_TESTS

    if (!canNativeInstall && vm == null) {
      context.skip()
      return
    }

    const tmpDir = new TmpDir("msix-single-arch")
    let builtDir: string | undefined
    let result: MsixInstallResult | undefined

    try {
      await buildMsixApp(expect, tmpDir, Platform.WINDOWS.createTarget(["msix"], Arch.x64), {}, async (ctx: PackedContext) => {
        builtDir = await tmpDir.getTempDir({ prefix: "built" })
        await move(ctx.outDir, builtDir)
      })

      if (!builtDir) {
        throw new Error("Build did not produce output")
      }

      const msixFiles = require("fs")
        .readdirSync(builtDir)
        .filter((f: string) => f.endsWith(".msix"))
      expect(msixFiles.length).toBeGreaterThan(0)
      const msixPath = path.join(builtDir, msixFiles[0])

      if (canNativeInstall) {
        result = installMsixNative(msixPath, TEST_IDENTITY_NAME)
      } else {
        result = await installMsixInVm(vm!, msixPath, TEST_IDENTITY_NAME)
      }

      expect(result.packageFamilyName).toMatch(/^TestAppMsix_/)
      expect(result.installLocation).not.toBe("")
    } finally {
      if (result) {
        try {
          if (canNativeInstall) {
            uninstallMsixNative(result.packageFamilyName, result.certThumbprint)
          } else if (vm) {
            await uninstallMsixInVm(vm, result.packageFamilyName, result.certThumbprint)
          }
        } catch (e) {
          console.error("MSIX cleanup failed:", e)
        }
      }
      await tmpDir.cleanup().catch(() => {})
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2 — multi-arch .msixbundle: build → install → verify → uninstall
  // ─────────────────────────────────────────────────────────────────────────
  test("multi-arch msixbundle installs via VM", optionsForFlakyE2E, async (context: TestContext) => {
    const { expect } = context
    const vm = await windowsVmPromise
    const isNativeWindows = process.platform === "win32"
    const canNativeInstall = isNativeWindows && RUN_MSIX_INSTALL_TESTS

    if (!canNativeInstall && vm == null) {
      context.skip()
      return
    }

    const tmpDir = new TmpDir("msix-bundle")
    let builtDir: string | undefined
    let result: MsixInstallResult | undefined

    try {
      await buildMsixApp(expect, tmpDir, Platform.WINDOWS.createTarget(["msix"], Arch.ia32, Arch.x64), { createMsixbundle: true }, async (ctx: PackedContext) => {
        builtDir = await tmpDir.getTempDir({ prefix: "built-bundle" })
        await move(ctx.outDir, builtDir)
      })

      if (!builtDir) {
        throw new Error("Build did not produce output")
      }

      const bundleFiles = require("fs")
        .readdirSync(builtDir)
        .filter((f: string) => f.endsWith(".msixbundle"))
      expect(bundleFiles.length).toBeGreaterThan(0)
      const bundlePath = path.join(builtDir, bundleFiles[0])

      if (canNativeInstall) {
        result = installMsixNative(bundlePath, TEST_IDENTITY_NAME)
      } else {
        result = await installMsixInVm(vm!, bundlePath, TEST_IDENTITY_NAME)
      }

      expect(result.packageFamilyName).toMatch(/^TestAppMsix_/)
      expect(result.installLocation).not.toBe("")
    } finally {
      if (result) {
        try {
          if (canNativeInstall) {
            uninstallMsixNative(result.packageFamilyName, result.certThumbprint)
          } else if (vm) {
            await uninstallMsixInVm(vm, result.packageFamilyName, result.certThumbprint)
          }
        } catch (e) {
          console.error("MSIX cleanup failed:", e)
        }
      }
      await tmpDir.cleanup().catch(() => {})
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3 — enforcePackageIntegrity: install, verify manifest via
  // Get-AppxPackageManifest, and confirm uap10:PackageIntegrity is present
  // ─────────────────────────────────────────────────────────────────────────
  test("msix with enforcePackageIntegrity installs and manifest contains integrity element", optionsForFlakyE2E, async (context: TestContext) => {
    const { expect } = context
    const vm = await windowsVmPromise
    const isNativeWindows = process.platform === "win32"
    const canNativeInstall = isNativeWindows && RUN_MSIX_INSTALL_TESTS

    if (!canNativeInstall && vm == null) {
      context.skip()
      return
    }

    const tmpDir = new TmpDir("msix-integrity")
    let builtDir: string | undefined
    let result: MsixInstallResult | undefined

    try {
      await buildMsixApp(expect, tmpDir, Platform.WINDOWS.createTarget(["msix"], Arch.x64), { enforcePackageIntegrity: true }, async (ctx: PackedContext) => {
        builtDir = await tmpDir.getTempDir({ prefix: "built-integrity" })
        await move(ctx.outDir, builtDir)
      })

      if (!builtDir) {
        throw new Error("Build did not produce output")
      }

      const msixFiles = require("fs")
        .readdirSync(builtDir)
        .filter((f: string) => f.endsWith(".msix"))
      expect(msixFiles.length).toBeGreaterThan(0)
      const msixPath = path.join(builtDir, msixFiles[0])

      if (canNativeInstall) {
        result = installMsixNative(msixPath, TEST_IDENTITY_NAME)
      } else {
        result = await installMsixInVm(vm!, msixPath, TEST_IDENTITY_NAME)
      }

      expect(result.packageFamilyName).toMatch(/^TestAppMsix_/)

      // Verify the installed manifest contains the PackageIntegrity element
      let manifestXml: string
      if (canNativeInstall) {
        const psOut = require("child_process").execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", manifestQueryPs(result.packageFamilyName)], {
          encoding: "utf8",
        })
        manifestXml = psOut
      } else {
        manifestXml = await vm!.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", manifestQueryPs(result.packageFamilyName)])
      }

      expect(manifestXml).toContain("PackageIntegrity")
    } finally {
      if (result) {
        try {
          if (canNativeInstall) {
            uninstallMsixNative(result.packageFamilyName, result.certThumbprint)
          } else if (vm) {
            await uninstallMsixInVm(vm, result.packageFamilyName, result.certThumbprint)
          }
        } catch (e) {
          console.error("MSIX cleanup failed:", e)
        }
      }
      await tmpDir.cleanup().catch(() => {})
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4 — launch: install, find exe inside package, launch it, verify
  // ─────────────────────────────────────────────────────────────────────────
  test("msix app executable launches from install location", optionsForFlakyE2E, async (context: TestContext) => {
    const { expect } = context
    const vm = await windowsVmPromise

    // Launch test only supported via Parallels VM (native Windows test infra
    // would need an interactive desktop session which CI runners can't guarantee)
    if (vm == null) {
      context.skip()
      return
    }

    const tmpDir = new TmpDir("msix-launch")
    let builtDir: string | undefined
    let result: MsixInstallResult | undefined

    try {
      await buildMsixApp(expect, tmpDir, Platform.WINDOWS.createTarget(["msix"], Arch.x64), {}, async (ctx: PackedContext) => {
        builtDir = await tmpDir.getTempDir({ prefix: "built-launch" })
        await move(ctx.outDir, builtDir)
      })

      if (!builtDir) {
        throw new Error("Build did not produce output")
      }

      const msixFiles = require("fs")
        .readdirSync(builtDir)
        .filter((f: string) => f.endsWith(".msix"))
      const msixPath = path.join(builtDir, msixFiles[0])
      result = await installMsixInVm(vm, msixPath, TEST_IDENTITY_NAME)

      // The Electron app is a full-trust Windows.FullTrustApplication: its exe is
      // directly accessible at installLocation\app\TestApp.exe without MSIX sandbox
      // restrictions for launch purposes.
      const output = await launchMsixAppInVm(vm, result.installLocation, "TestApp.exe", 30_000)
      expect(output).toContain("LAUNCHED:true")
    } finally {
      if (result) {
        try {
          // vm is non-null: the early return above guarantees it
          await uninstallMsixInVm(vm, result.packageFamilyName, result.certThumbprint)
        } catch (e) {
          console.error("MSIX cleanup failed:", e)
        }
      }
      await tmpDir.cleanup().catch(() => {})
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5 — windows services: manifest contains desktop6 extension
  // ─────────────────────────────────────────────────────────────────────────
  test("msix with windowsServices manifest contains desktop6 extension", optionsForFlakyE2E, async (context: TestContext) => {
    const { expect } = context
    const vm = await windowsVmPromise
    const isNativeWindows = process.platform === "win32"
    const canNativeInstall = isNativeWindows && RUN_MSIX_INSTALL_TESTS

    if (!canNativeInstall && vm == null) {
      context.skip()
      return
    }

    const tmpDir = new TmpDir("msix-services")
    let builtDir: string | undefined
    let result: MsixInstallResult | undefined

    try {
      await buildMsixApp(
        expect,
        tmpDir,
        Platform.WINDOWS.createTarget(["msix"], Arch.x64),
        {
          windowsServices: [
            {
              name: "TestAppSvc",
            },
          ],
        },
        async (ctx: PackedContext) => {
          builtDir = await tmpDir.getTempDir({ prefix: "built-svc" })
          await move(ctx.outDir, builtDir)
        }
      )

      if (!builtDir) {
        throw new Error("Build did not produce output")
      }

      const msixFiles = require("fs")
        .readdirSync(builtDir)
        .filter((f: string) => f.endsWith(".msix"))
      expect(msixFiles.length).toBeGreaterThan(0)
      const msixPath = path.join(builtDir, msixFiles[0])

      if (canNativeInstall) {
        result = installMsixNative(msixPath, TEST_IDENTITY_NAME)
      } else {
        result = await installMsixInVm(vm!, msixPath, TEST_IDENTITY_NAME)
      }

      // Verify manifest via Get-AppxPackageManifest
      let manifestXml: string
      if (canNativeInstall) {
        manifestXml = require("child_process").execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", manifestQueryPs(result.packageFamilyName)], {
          encoding: "utf8",
        })
      } else {
        manifestXml = await vm!.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", manifestQueryPs(result.packageFamilyName)])
      }

      expect(manifestXml).toContain("windows.service")
      expect(manifestXml).toContain("TestAppSvc")
    } finally {
      if (result) {
        try {
          if (canNativeInstall) {
            uninstallMsixNative(result.packageFamilyName, result.certThumbprint)
          } else if (vm) {
            await uninstallMsixInVm(vm, result.packageFamilyName, result.certThumbprint)
          }
        } catch (e) {
          console.error("MSIX cleanup failed:", e)
        }
      }
      await tmpDir.cleanup().catch(() => {})
    }
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6 — msixupload: verify the .msixupload ZIP is produced and valid
  // ─────────────────────────────────────────────────────────────────────────
  test("msix with createMsixupload produces a valid zip archive", optionsForFlakyE2E, async (context: TestContext) => {
    const { expect } = context
    const vm = await windowsVmPromise
    const isNativeWindows = process.platform === "win32"
    const canNativeInstall = isNativeWindows && RUN_MSIX_INSTALL_TESTS

    // This test only needs makeappx to build; it doesn't need to install.
    if (!canNativeInstall && vm == null) {
      context.skip()
      return
    }

    const tmpDir = new TmpDir("msix-upload")
    let builtDir: string | undefined

    try {
      await buildMsixApp(
        expect,
        tmpDir,
        Platform.WINDOWS.createTarget(["msix"], Arch.ia32, Arch.x64),
        {
          createMsixbundle: true,
          createMsixupload: true,
        },
        async (ctx: PackedContext) => {
          builtDir = await tmpDir.getTempDir({ prefix: "built-upload" })
          await move(ctx.outDir, builtDir)
        }
      )

      if (!builtDir) {
        throw new Error("Build did not produce output")
      }

      const allFiles = require("fs").readdirSync(builtDir)
      const uploadFiles = allFiles.filter((f: string) => f.endsWith(".msixupload"))
      const bundleFiles = allFiles.filter((f: string) => f.endsWith(".msixbundle"))

      expect(uploadFiles.length).toBeGreaterThan(0)
      expect(bundleFiles.length).toBeGreaterThan(0)

      // Verify the .msixupload is a valid ZIP by reading its local file header signature (PK\x03\x04)
      const uploadPath = path.join(builtDir, uploadFiles[0])
      const header = Buffer.alloc(4)
      const fd = require("fs").openSync(uploadPath, "r")
      require("fs").readSync(fd, header, 0, 4, 0)
      require("fs").closeSync(fd)
      expect(header.toString("hex")).toBe("504b0304")
    } finally {
      await tmpDir.cleanup().catch(() => {})
    }
  })
})
