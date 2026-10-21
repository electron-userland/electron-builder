/**
 * MSIX auto-update e2e on native Windows. A signed v1 .msixbundle built with `msix.electronUpdaterAware` is installed as a user installs it
 * (Add-AppxPackage, its certificate trusted in LocalMachine\TrustedPeople). Launched through an app execution alias, which gives the process
 * package identity (MsixUpdater stays inactive without it), v1 downloads v2 from a local generic server (`latest-msix.yml`) with electron-updater's
 * MsixUpdater, Electron's native MSIX autoUpdater stages it, and quitAndInstall has Windows register it.
 *
 * Both versions sign `latest-msix.yml` with a runtime-generated key: MsixUpdater only downloads an update whose manifest a trusted key verifies.
 *
 * It also proves on real Windows what the build records: the package family name hint in `latest-msix.yml` and the bundle version (`makeappx /bv`).
 *
 * Needs elevation (the machine certificate store) and Windows 10 version 2004 (build 19041), which the native staging requires. Skipped without
 * elevation outside CI; in CI (an elevated windows-latest runner) it must run.
 */
import AdmZip from "adm-zip"
import { getTemplatePath } from "app-builder-lib/src/util/pathManager"
import { generateUpdateSigningKeypair, log, TmpDir } from "builder-util"
import { parseXml, verifyManifestSignatures } from "builder-util-runtime"
import { execFileSync } from "child_process"
import { Arch, Configuration } from "electron-builder"
import { copyFile, existsSync, outputFile, readFile } from "fs-extra"
import { release } from "os"
import * as path from "path"
import { ExpectStatic, TestContext } from "vitest"
import { launchAndWaitForQuit } from "../helpers/launchAppCrossPlatform"
import { getWindowsSigningIdentity } from "../helpers/packTester"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER, testAppCacheDirName } from "../helpers/updaterTestUtil"
import {
  addMsixPackageNative,
  getMsixPackageVersionNative,
  removeMsixPackagesNative,
  removeTrustedCertificateNative,
  trustCertificateNative,
  waitForAppExecutionAlias,
} from "./blackboxInstallMsix"
import { windowsLocalAppData } from "./blackboxInstallWindows"
import { ApplicationUpdatePaths, doBuild, manifestVerifiedMarker, optionsForFlakyE2E, runTestWithinServer } from "./blackboxUpdateHelpers"
import { findUpdateManifests, readEmbeddedUpdateConfig, readUpdateManifest } from "./signedManifestTestUtil"

const IDENTITY_NAME = "TestAppMsixUpdate"
const EXECUTION_ALIAS = "eb-msix-update-test.exe"
// doBuild names the artifacts "${productName}.${ext}"
const BUNDLE_NAME = "TestApp.msixbundle"
const APP_IMAGE_NAME = "TestApp.exe"
const OLD_PACKAGE_VERSION = `${OLD_VERSION_NUMBER}.0`
const NEW_PACKAGE_VERSION = `${NEW_VERSION_NUMBER}.0`

const msixConfig: Configuration = {
  msix: {
    electronUpdaterAware: true,
    identityName: IDENTITY_NAME,
    publisherDisplayName: "electron-builder",
    // written into the test project by writeManifestWithExecutionAlias
    customManifestPath: "msix/AppxManifest.xml",
  },
}

// two builds, an install and an update within the 60-minute job of a Windows shard: one retry at most
const msixUpdateTestOptions = { ...optionsForFlakyE2E, retry: 1 } as const

type LaunchResult = Awaited<ReturnType<typeof launchAndWaitForQuit>>

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ${executable} is a macro of the manifest template (the app executable)
const EXECUTION_ALIAS_EXTENSIONS =
  "<Extensions>" +
  '<uap3:Extension Category="windows.appExecutionAlias" Executable="${executable}" EntryPoint="Windows.FullTrustApplication">' +
  `<uap3:AppExecutionAlias><desktop:ExecutionAlias Alias="${EXECUTION_ALIAS}" /></uap3:AppExecutionAlias>` +
  "</uap3:Extension>" +
  "</Extensions>"

function replaceOnce(text: string, search: string, replacement: string): string {
  if (!text.includes(search)) {
    throw new Error(`${search} is not in the MSIX manifest template`)
  }
  return text.replace(search, () => replacement)
}

/** Writes the default MSIX manifest template with an app execution alias as the custom manifest of the test project (`msix.customManifestPath`). */
async function writeManifestWithExecutionAlias(projectDir: string): Promise<void> {
  const template = await readFile(path.join(getTemplatePath("msix"), "appxmanifest.xml"), "utf8")
  if (!template.includes('xmlns:desktop="http://schemas.microsoft.com/appx/manifest/desktop/windows10"')) {
    throw new Error("The MSIX manifest template does not declare xmlns:desktop (of desktop:ExecutionAlias) anymore")
  }
  const uapNamespace = 'xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"'
  // uap3 (Windows 10 1607) is older than the default msix.minVersion (10.0.17763.0), so it does not belong in IgnorableNamespaces
  const manifest = replaceOnce(template, uapNamespace, `${uapNamespace}\n   xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"`)
  await outputFile(path.join(projectDir, "build", "msix", "AppxManifest.xml"), replaceOnce(manifest, "${extensions}", EXECUTION_ALIAS_EXTENSIONS))
}

// fltmc (the filter manager control program) exits 0 only with an elevated administrator token, and unlike `net session` needs no Server service
function isElevated(): boolean {
  try {
    execFileSync("fltmc", [], { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

// Electron's MSIX autoUpdater stages the update with AddPackageByUriAsync, which needs Windows 10 version 2004
function isWindows10Version2004OrLater(): boolean {
  const build = Number(release().split(".")[2])
  return Number.isInteger(build) && build >= 19041
}

/** Launches the app through its execution alias without the updater: it prints APP_VERSION and MSIX_IDENTITY, then quits. */
function probeApp(aliasPath: string, expectedVersion?: string): Promise<LaunchResult> {
  return launchAndWaitForQuit({
    appPath: aliasPath,
    timeoutMs: 60 * 1000,
    updateConfigPath: "",
    packageManagerToTest: "",
    env: { AUTO_UPDATER_TEST: "" },
    expectedVersion,
    // MSIX_IDENTITY follows the first APP_VERSION line
    waitForExit: true,
  })
}

/** Probes until the app reports `version`: a launch right after the registration can fail or still start the old version. */
async function probeUntilVersion(aliasPath: string, version: string): Promise<LaunchResult> {
  const deadline = Date.now() + 2 * 60 * 1000
  let lastProbe = "none"
  while (Date.now() < deadline) {
    try {
      const probe = await probeApp(aliasPath)
      if (probe.version === version) {
        return probe
      }
      lastProbe = `APP_VERSION ${probe.version}\n${probe.stdout}`
    } catch (error: any) {
      lastProbe = error.message
    }
    await sleep(5000)
  }
  throw new Error(`The app launched through its execution alias did not report ${version} within 2 minutes. Last probe: ${lastProbe}`)
}

/** The MSIX_IDENTITY line of the fixture app must report package identity and the family name Electron's MSIX autoUpdater sees. */
function expectPackageIdentity(expect: ExpectStatic, stdout: string, packageFamilyName: string): void {
  const line = /^MSIX_IDENTITY: (.+)$/m.exec(stdout)?.[1]
  const identity = line == null ? null : JSON.parse(line)
  if (identity?.windowsStore !== true) {
    // Only an activation, here through the execution alias, gives the process package identity (app\TestApp.exe in the install dir has none).
    // Should a process that Node spawns from the alias have none, launch the alias through `cmd.exe /d /s /c "<alias>"` instead.
    throw new Error(`The app launched through its execution alias runs without package identity (MSIX_IDENTITY: ${line ?? "not printed"}), so MsixUpdater stays inactive`)
  }
  expect(identity.packageFamilyName).toBe(packageFamilyName)
}

/** Waits until Windows has registered `version` of the package, which it does after the app shut down for the update. */
async function waitForInstalledVersion(expect: ExpectStatic, version: string, updateStdout: string): Promise<void> {
  const deadline = Date.now() + 5 * 60 * 1000
  let installedVersion = getMsixPackageVersionNative(IDENTITY_NAME)
  while (installedVersion !== version && Date.now() < deadline) {
    await sleep(5000)
    installedVersion = getMsixPackageVersionNative(IDENTITY_NAME)
  }
  expect(installedVersion, `Windows did not register ${version}. Stdout of the update launch:\n${updateStdout}`).toBe(version)
}

// cleanup never throws, so that it cannot hide the error of the test
async function runCleanupStep(name: string, step: () => void | Promise<void>): Promise<void> {
  try {
    await step()
  } catch (error: any) {
    log.error({ error: error.message }, `MSIX auto-update test cleanup: ${name} failed`)
  }
}

describe.heavy("msix auto-update", msixUpdateTestOptions, () => {
  test("installed msixbundle updates itself with MsixUpdater", msixUpdateTestOptions, async (context: TestContext) => {
    const isElevatedSession = isElevated()
    if ((!isElevatedSession && !process.env.CI) || !isWindows10Version2004OrLater()) {
      context.skip("needs Windows 10 version 2004 (build 19041) or later and, outside CI, an elevated session (fltmc)")
      return
    }
    // the snapshot pins the package family name of the self-signed test identity, and trustCertificateNative takes a base64 PKCS#12
    if ((await getWindowsSigningIdentity()).commonName === "provided") {
      context.skip("signs with the self-signed test identity only: unset CSC_LINK / WIN_CSC_LINK")
      return
    }

    const { expect } = context
    // signed as in runSignedManifestTest: MsixUpdater refuses to download without a trusted key, and the build refuses packTester's default updateManifest: false
    const key = generateUpdateSigningKeypair()
    const signedMsixConfig: Configuration = { ...msixConfig, updateManifest: { signingKey: key.privateKeyPem } }
    const tmpDir = new TmpDir("msix-auto-update")
    const outDirs: Array<ApplicationUpdatePaths> = []
    const aliasPath = path.join(windowsLocalAppData(), "Microsoft", "WindowsApps", EXECUTION_ALIAS)
    let trustedThumbprint: string | null = null
    let isInstallAttempted = false
    try {
      // a) v1 only: the checks below fail before the second build. The app-update.yml packed into v1 trusts the signing key
      await doBuild(expect, outDirs, "msix", Arch.x64, tmpDir, /* isWindows */ true, signedMsixConfig, [OLD_VERSION_NUMBER], writeManifestWithExecutionAlias)
      expect((await readEmbeddedUpdateConfig(outDirs[0].dir)).updateManifestPublicKey).toBe(key.publicKeyPem)
      const { packageFamilyName } = (await readUpdateManifest(outDirs[0].dir)).files[0]
      if (packageFamilyName == null) {
        throw new Error("latest-msix.yml of v1 has no packageFamilyName")
      }
      expect(packageFamilyName).toMatch(new RegExp(`^${IDENTITY_NAME}_[0-9a-z]{13}$`))

      // b) the machine can install packages: elevation for LocalMachine\TrustedPeople, and the Appx module (which loads and queries the AppX
      // deployment service here; a package left by an earlier run is removed by the install)
      if (!isElevatedSession) {
        throw new Error("The MSIX auto-update test must run elevated: it trusts the signing certificate in LocalMachine\\TrustedPeople")
      }
      log.info({ installedVersion: getMsixPackageVersionNative(IDENTITY_NAME) }, "AppX deployment available")

      // c) the certificate doBuild signed with (signedWin)
      const { p12Base64, password } = await getWindowsSigningIdentity()
      trustedThumbprint = trustCertificateNative(p12Base64, password)

      // d) install v1 as a user does
      isInstallAttempted = true
      const installed = addMsixPackageNative(path.join(outDirs[0].dir, BUNDLE_NAME), IDENTITY_NAME)
      expect(installed.version).toBe(OLD_PACKAGE_VERSION)
      // MsixUpdater is inactive for other signature kinds
      expect(installed.signatureKind).toMatch(/^(developer|enterprise)$/i)
      // the family name Windows derives is the one computePackageFamilyName recorded at build time
      expect(installed.packageFamilyName).toBe(packageFamilyName)

      // e) the app runs with package identity when launched through its execution alias
      await waitForAppExecutionAlias(aliasPath, 60 * 1000)
      const v1Probe = await probeApp(aliasPath, OLD_VERSION_NUMBER)
      await v1Probe.assert(() => expectPackageIdentity(expect, v1Probe.stdout, packageFamilyName))

      // f) v2: latest-msix.yml is signed with the key and lists only the bundle, with its hints, and the bundle has the version of its packages (makeappx /bv)
      await doBuild(expect, outDirs, "msix", Arch.x64, tmpDir, /* isWindows */ true, signedMsixConfig, [NEW_VERSION_NUMBER], writeManifestWithExecutionAlias)
      const v2Dir = outDirs[1].dir
      expect((await findUpdateManifests(v2Dir)).map(it => path.basename(it))).toEqual(["latest-msix.yml"])
      const v2Info = await readUpdateManifest(v2Dir)
      expect(v2Info.signatures).toHaveLength(1)
      expect(verifyManifestSignatures(v2Info, [key.publicKeyPem])).toMatchObject({ ok: true })
      const v2Files = v2Info.files
      expect(v2Files).toHaveLength(1)
      expect(v2Files[0]).toMatchObject({ url: BUNDLE_NAME, packageFamilyName, packageVersion: NEW_PACKAGE_VERSION })
      const bundleManifest = new AdmZip(path.join(v2Dir, BUNDLE_NAME)).getEntry("AppxMetadata/AppxBundleManifest.xml")
      expect(bundleManifest, "AppxMetadata/AppxBundleManifest.xml in the bundle").not.toBeNull()
      expect(parseXml(bundleManifest!.getData().toString("utf8")).element("Identity").attribute("Version")).toBe(NEW_PACKAGE_VERSION)

      // g) v1 verifies the signed latest-msix.yml, downloads v2 into the LocalCache of its package, has Windows stage it and installs it with the native
      // quitAndInstall (isForceRunAfter, AUTO_UPDATER_TEST_AUTO_RUN_AFTER_INSTALL in the fixture). The served config replaces the embedded app-update.yml
      // (S3, see doBuild), so it carries the trusted key too
      await runTestWithinServer(
        async (rootDirectory, updateConfigPath) => {
          for (const file of ["latest-msix.yml", BUNDLE_NAME]) {
            await copyFile(path.join(v2Dir, file), path.join(rootDirectory, file))
          }
          const update = await launchAndWaitForQuit({
            appPath: aliasPath,
            timeoutMs: 5 * 60 * 1000,
            updateConfigPath,
            packageManagerToTest: "",
            env: { AUTO_UPDATER_TEST_AUTO_RUN_AFTER_INSTALL: "true" },
            expectedVersion: OLD_VERSION_NUMBER,
            waitForExit: true,
          })
          log.info({ stdout: update.stdout, stderr: update.stderr }, "MSIX update launch completed")
          await update.assert(() => {
            expect(update.stdout).toContain(manifestVerifiedMarker(NEW_VERSION_NUMBER))
            expect(update.stdout).toContain("Update downloaded")
            // MsixUpdater reports it when Windows did not install the update while the app was running (it shuts the app down to install it)
            expect(update.stdout).not.toContain("ERR_UPDATER_MSIX_INSTALL_FAILED")
            expectPackageIdentity(expect, update.stdout, packageFamilyName)
          })

          // h) Windows registers v2, which then runs with the same identity, and the verified bundle stays in the LocalCache of the package
          await waitForInstalledVersion(expect, NEW_PACKAGE_VERSION, update.stdout)
          const v2Probe = await probeUntilVersion(aliasPath, NEW_VERSION_NUMBER)
          await v2Probe.assert(() => expectPackageIdentity(expect, v2Probe.stdout, packageFamilyName))
          const pendingBundle = path.join(windowsLocalAppData(), "Packages", packageFamilyName, "LocalCache", testAppCacheDirName, "pending", BUNDLE_NAME)
          expect(existsSync(pendingBundle), pendingBundle).toBe(true)
        },
        undefined,
        { updaterCacheDirName: testAppCacheDirName, updateManifestPublicKey: key.publicKeyPem }
      )
    } finally {
      // i) also after a failure: the app (or the instance Windows restarted after the update) holds the package
      try {
        execFileSync("taskkill", ["/F", "/T", "/IM", APP_IMAGE_NAME], { stdio: "ignore" })
      } catch {
        // no such process
      }
      await sleep(1000)
      if (isInstallAttempted) {
        await runCleanupStep("removing the package", () => removeMsixPackagesNative(IDENTITY_NAME))
      }
      const thumbprint = trustedThumbprint
      if (thumbprint != null) {
        await runCleanupStep("removing the trusted certificate", () => removeTrustedCertificateNative(thumbprint))
      }
      await runCleanupStep("removing the temp dir", () => tmpDir.cleanup())
    }
  })
})
