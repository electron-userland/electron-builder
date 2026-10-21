import { TmpDir } from "builder-util"
import { Arch, Configuration, Platform } from "electron-builder"
import { move } from "fs-extra"
import path from "path"
import { ExpectStatic } from "vitest"
import { PM } from "app-builder-lib/internal"
import { assertPack, modifyPackageJson, PackedContext } from "../helpers/packTester"
import { ELECTRON_VERSION } from "../helpers/testConfig"
import { resetWindowsNativeInstall, UPDATER_STORE_DIR_NAME, windowsLocalAppData } from "./blackboxInstallWindows"

// Shared by the web installer blackbox tests (blackboxWebInstallerTest.ts, blackboxWebInstallerPackageTest.ts), which run the web
// installer of the test app built by buildWebInstaller.

export const stubName = "TestApp Web Setup.exe"
export const packageFileName = "testapp-1.0.0-x64.nsis.7z"
// native Windows: the per-user install and the package the web installer stores for differential updates
const installDir = path.join(windowsLocalAppData(), "Programs", "TestApp")
export const appExe = path.join(installDir, "TestApp.exe")
export const uninstaller = path.join(installDir, "Uninstall TestApp.exe")
export const storedPackage = path.join(windowsLocalAppData(), UPDATER_STORE_DIR_NAME, "package.7z")

/** Native Windows: stops a running web installer, uninstalls TestApp and removes the package a web installer stored. */
export function resetNativeInstall(): Promise<void> {
  return resetWindowsNativeInstall(stubName, [storedPackage])
}

/** Builds the unsigned x64 web installer of the test app (1.0.0, "store" compression) and returns the build output directory. */
export async function buildWebInstaller(
  expect: ExpectStatic,
  tmpDir: TmpDir,
  { nsisWeb, publish }: { nsisWeb: Configuration["nsisWeb"]; publish: Configuration["publish"] }
): Promise<string> {
  let builtDir: string | undefined
  await assertPack(
    expect,
    "test-app",
    {
      targets: Platform.WINDOWS.createTarget(["nsis-web"], Arch.x64),
      config: {
        productName: "TestApp",
        executableName: "TestApp",
        appId: "com.test.webinstaller",
        artifactName: "${productName}-${version}-${arch}.${ext}",
        extraMetadata: { name: "testapp", version: "1.0.0" },
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
        compression: "store",
        nsisWeb: {
          ...nsisWeb,
          artifactName: "TestApp Web Setup.${ext}",
        },
        publish,
      },
    },
    {
      packageManager: PM.PNPM,
      packed: async (ctx: PackedContext) => {
        builtDir = await tmpDir.getTempDir({ prefix: "built" })
        await move(ctx.outDir, builtDir)
      },
      // pnpm 11 reads its settings from pnpm-workspace.yaml only (not the `pnpm` key of package.json); packTester writes this for the install
      packageManagerSettings: { supportedArchitectures: { os: ["current"], cpu: ["x64"] } },
      projectDirCreated: async (projectDir: string) => {
        await modifyPackageJson(
          projectDir,
          data => {
            data.devDependencies = { electron: ELECTRON_VERSION }
          },
          true
        )
      },
    }
  )

  if (!builtDir) {
    throw new Error("Build did not produce output directory")
  }
  return builtDir
}
