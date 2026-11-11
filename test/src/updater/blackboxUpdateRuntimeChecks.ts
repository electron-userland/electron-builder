import { ToolsetConfig } from "app-builder-lib"
import { Arch } from "electron-builder"
import { readdir, readJson } from "fs-extra"
import path from "path"
import { ExpectStatic, TestContext } from "vitest"
import { WIN_SIGNING_PUBLISHER_NAME } from "../helpers/codeSignData"
import { launchAndWaitForQuit, LocalServer } from "../helpers/launchAppCrossPlatform"
import { getWindowsSigningIdentity } from "../helpers/packTester"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER } from "../helpers/updaterTestUtil"
import { trustSigningIdentityInMachineRoot } from "../helpers/windowsSignedFixture"
import { authenticodeStubCalls, countOf, FixtureUpdaterKnobs, fixtureEnv, leftoverPartialDownloads, NOT_LOOPBACK_LOCALHOST_NAME, pendingUpdateDir } from "./blackboxFixtureEnv"
import { NSIS_INSTALLER_IMAGE_NAME, readInstalledPackageType, UPDATER_STORE_DIR_NAME, waitForWindowsProcessExit } from "./blackboxInstallWindows"
import {
  assertDifferentialDownload,
  expectRejectedUpdate,
  pollUntilNewVersionInstalled,
  runUpdateScenario,
  ScenarioContext,
  THIRD_VERSION_NUMBER,
  updateHop,
  withEmptyUpdaterCaches,
  writeRawServedUpdateConfig,
  writeServedUpdateConfig,
} from "./blackboxUpdateHelpers"
import { findUpdateManifests, readEmbeddedUpdateConfig, readUpdateManifest, rewriteServedManifests } from "./signedManifestTestUtil"

// The request rules of electron-updater 7 on real updates of the test app. The errors and warnings are what the app's user meets, so their
// texts and links are asserted next to their codes; the requests the servers recorded show what was sent where.

const CROSS_ORIGIN_HEADERS_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#cross-origin-headers"
const INSECURE_FEED_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#update-requests-require-https"
const DOWNLOAD_SIZE_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#full-downloads-stop-at-the-declared-size"
const PACKAGED_INSECURE_FEED_WARNING = "autoUpdater.allowInsecureFeed is true in a packaged app"
const SQUIRREL_PROXY_SERVING = "[updater debug] Proxy server for native Squirrel.Mac: serving "
const SQUIRREL_PROXY_REJECTED = "[updater debug] Proxy server for native Squirrel.Mac: request without valid credentials rejected"

// the app's credential and custom header in the update launch: neither may reach another origin, and no log line may hold the credential
const AUTH_SECRET = "e2e-secret"
const APP_REQUEST_HEADERS = { "X-Tenant": "acme" }

/** The warning about APP_REQUEST_HEADERS and the Authorization header, which a request from `feed` to `other` leaves out. */
function leftOutHeadersWarning(feed: LocalServer, other: LocalServer): string {
  return `[updater warn] autoUpdater.crossOriginHeaders left out authorization, x-tenant for the request from ${feed.url} to ${other.url}, another origin than the update feed, so they are not sent there.`
}

/** The path of the served channel file on the feed: `/latest-mac.yml`, `/latest-linux.yml`, ... */
async function channelFilePath(rootDirectory: string): Promise<string> {
  const manifests = await findUpdateManifests(rootDirectory)
  if (manifests.length !== 1) {
    throw new Error(`Expected one served latest*.yml in ${rootDirectory}, found ${manifests.length}`)
  }
  return `/${path.basename(manifests[0])}`
}

/** Without autoUpdater.crossOriginHeaders, the update check fails before it sends any request (#10563). */
export async function expectCrossOriginHeadersRequired(ctx: ScenarioContext): Promise<void> {
  const { expect } = ctx
  await expectRejectedUpdate(ctx, {
    installedVersion: OLD_VERSION_NUMBER,
    expectedErrorCode: "ERR_UPDATER_CROSS_ORIGIN_HEADERS_NOT_CONFIGURED",
    env: fixtureEnv({ crossOriginHeaders: "unset" }),
    manifests: "unsigned",
    expectNoRequests: true,
    assertLaunch: stdout => {
      expect(stdout).toContain("checkForUpdates requires autoUpdater.crossOriginHeaders")
      expect(stdout).toContain(CROSS_ORIGIN_HEADERS_DOCS)
    },
  })
}

/**
 * A plain http feed on a host that electron-updater does not take for loopback (#10566): `eb-e2e.localhost`, which Chromium resolves to the
 * feed's 127.0.0.1. The update check fails before it sends any request. With allowInsecureFeed, which a packaged app warns about, the feed
 * is requested, and its redirect of the channel file to `other`, a loopback origin, is refused. The served config is restored afterwards.
 */
export async function expectNonLoopbackFeedRules(ctx: ScenarioContext, other: LocalServer): Promise<void> {
  const { expect, rootDirectory, updateConfigPath, serverConfig } = ctx
  const { feed } = ctx.servers
  const channelFile = await channelFilePath(rootDirectory)
  const feedUrl = `http://${NOT_LOOPBACK_LOCALHOST_NAME}:${feed.port}`
  await writeServedUpdateConfig(updateConfigPath, { ...serverConfig, url: feedUrl })
  try {
    await expectRejectedUpdate(ctx, {
      installedVersion: OLD_VERSION_NUMBER,
      expectedErrorCode: "ERR_UPDATER_INSECURE_FEED",
      // over the allowInsecureFeed that the harness passes for a feed that is not loopback (insecureFeedEnv)
      env: fixtureEnv({ allowInsecureFeed: false }),
      manifests: "unsigned",
      expectNoRequests: true,
      assertLaunch: stdout => {
        expect(stdout).toContain(`electron-updater rejects the update request to ${feedUrl}:`)
        expect(stdout).toContain(INSECURE_FEED_DOCS)
      },
    })

    feed.setRouter(pathname => (pathname === channelFile ? { redirectTo: `${other.url}${pathname}` } : null))
    feed.clearRequests()
    other.clearRequests()
    await expectRejectedUpdate(ctx, {
      installedVersion: OLD_VERSION_NUMBER,
      expectedErrorCode: "ERR_UPDATER_LOOPBACK_REDIRECT",
      env: fixtureEnv({ allowInsecureFeed: true }),
      manifests: "unsigned",
      assertLaunch: stdout => {
        expect(stdout).toContain(`electron-updater rejects the redirect to ${other.url}, a loopback host, from a host that is not loopback`)
        expect(countOf(stdout, PACKAGED_INSECURE_FEED_WARNING), "the packaged-app warning of allowInsecureFeed").toBe(1)
      },
    })
    await feed.settled()
    expect(
      feed.requests.map(({ pathname, status }) => ({ pathname, status })),
      "the feed on the host that is not loopback is requested once, and redirects"
    ).toEqual([{ pathname: channelFile, status: 302 }])
    expect(other.requests, "the redirect to the loopback origin is not followed").toEqual([])
  } finally {
    feed.setRouter(null)
    await writeServedUpdateConfig(updateConfigPath, serverConfig)
  }
}

/**
 * The installed app refuses the served update while its update info declares `declaredSize` bytes for a larger file (#10580): the full
 * download stops with ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED, and nothing of it is left in the pending directory. The feed's requests are the
 * ones of this launch afterwards.
 */
async function expectDownloadLargerThanDeclared(ctx: ScenarioContext, declaredSize: number): Promise<void> {
  const { expect, rootDirectory } = ctx
  const restore = await rewriteServedManifests(rootDirectory, info => ({ ...info, files: info.files.map(file => ({ ...file, size: declaredSize })) }))
  ctx.servers.feed.clearRequests()
  try {
    await expectRejectedUpdate(ctx, {
      installedVersion: OLD_VERSION_NUMBER,
      expectedErrorCode: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED",
      manifests: "unsigned",
      assertLaunch: stdout => {
        expect(stdout).toContain(`The download is larger than the ${declaredSize} bytes declared for it`)
        expect(stdout).toContain(DOWNLOAD_SIZE_DOCS)
      },
    })
  } finally {
    await restore()
  }
  // Strict on purpose, although it can fail intermittently with a temp-* file (more likely when the limit trips on the first chunk) until
  // the fix of fix/download-size-cap-temp-file lands: the download reported the size error before the asynchronous open of its
  // destination file, so emptying the pending directory could run before that open created the file.
  const pendingDir = pendingUpdateDir(UPDATER_STORE_DIR_NAME)
  expect(
    await leftoverPartialDownloads(pendingDir),
    `the download declared as ${declaredSize} bytes left a partial file in ${pendingDir} (a known race until a failed download is reported once its destination file is closed, fix/download-size-cap-temp-file)`
  ).toEqual([])
}

/**
 * A full download larger than the size of its file in the update info stops there (#10580): one byte larger (the limit trips on the last
 * chunk), and larger than a declared size of 1 byte (it trips on the first chunk: the request is aborted, and the rest of the zip is not sent).
 */
async function expectDownloadSizeLimit(ctx: ScenarioContext): Promise<void> {
  const { expect, rootDirectory, serverConfig } = ctx
  const { feed } = ctx.servers
  // the pending directory of the checks is in the cache that the served config names and withEmptyUpdaterCaches empties
  expect(serverConfig.updaterCacheDirName).toBe(UPDATER_STORE_DIR_NAME)
  const [zip] = (await readUpdateManifest(rootDirectory)).files
  if (zip.size == null) {
    throw new Error(`The update info has no size for ${zip.url}`)
  }

  await expectDownloadLargerThanDeclared(ctx, zip.size - 1)

  await expectDownloadLargerThanDeclared(ctx, 1)
  await feed.settled()
  expect(
    feed.requests.filter(it => it.pathname === `/${zip.url}`).map(({ status, aborted }) => ({ status, aborted })),
    "the download that passed its declared size on the first chunk: its request is aborted mid-body"
  ).toEqual([{ status: 200, aborted: true }])
}

/**
 * The update, whose zip the feed redirects to `other` while the app sends an Authorization and a custom header (#10563): the feed's origin
 * gets both, `other` neither, and the warning names both. Squirrel.Mac then takes the downloaded zip from the updater's local proxy (#10581).
 */
async function expectUpdateFromOtherOrigin(ctx: ScenarioContext, other: LocalServer): Promise<void> {
  const { expect, rootDirectory } = ctx
  const { feed } = ctx.servers
  const channelFile = await channelFilePath(rootDirectory)
  const zipPath = `/${(await readUpdateManifest(rootDirectory)).files[0].url}`
  feed.setRouter(pathname => (pathname === zipPath ? { redirectTo: `${other.url}${pathname}` } : null))
  feed.clearRequests()
  other.clearRequests()
  await updateHop(expect, {
    ...ctx,
    fromVersion: OLD_VERSION_NUMBER,
    toVersion: NEW_VERSION_NUMBER,
    env: fixtureEnv({ requestHeaders: APP_REQUEST_HEADERS, authHeader: `Bearer ${AUTH_SECRET}`, debugLog: true }),
    assertLaunch: stdout => {
      expect(countOf(stdout, leftOutHeadersWarning(feed, other)), "the warning about the headers left out for the other origin").toBe(1)
      expect(stdout, "a log line holds the value of the Authorization header").not.toContain(AUTH_SECRET)
      expectSquirrelProxyChallenge(expect, stdout)
    },
  })

  await Promise.all([feed.settled(), other.settled()])
  expect(feed.requests.map(({ pathname, status }) => ({ pathname, status }))).toEqual([
    { pathname: channelFile, status: 200 },
    { pathname: zipPath, status: 302 },
  ])
  for (const { pathname, headerNames } of feed.requests) {
    expect(headerNames, `the headers of ${pathname} on the feed's origin`).toEqual(expect.arrayContaining(["authorization", "x-tenant"]))
  }
  expect(other.requests.map(({ pathname, status }) => ({ pathname, status }))).toEqual([{ pathname: zipPath, status: 200 }])
  for (const { pathname, headerNames } of other.requests) {
    expect(headerNames, `the headers of ${pathname} on the other origin`).not.toContain("authorization")
    expect(headerNames, `the headers of ${pathname} on the other origin`).not.toContain("x-tenant")
  }
}

/**
 * Every route of the local proxy needs its credentials (#10581). Squirrel.Mac requests the zip without them and answers the challenge with
 * the credentials of the zip URL, so the proxy rejects a request before it serves the zip. The proxy logs both at debug level only.
 */
function expectSquirrelProxyChallenge(expect: ExpectStatic, stdout: string): void {
  const serving = stdout.indexOf(SQUIRREL_PROXY_SERVING)
  expect(serving, "the local proxy served the zip to Squirrel.Mac").toBeGreaterThanOrEqual(0)
  const rejected = stdout.indexOf(SQUIRREL_PROXY_REJECTED)
  expect(rejected, "the local proxy rejected a request without its credentials").toBeGreaterThanOrEqual(0)
  expect(rejected, "the local proxy rejected the request without its credentials before it served the zip").toBeLessThan(serving)
}

/**
 * The request rules of electron-updater 7 on a real mac update (zip, Squirrel.Mac, Electron's net), with one build pair for all of them. The
 * installed 1.0.0 refuses the served 1.0.1 without autoUpdater.crossOriginHeaders, from a plain http feed on a host that is not loopback (and
 * the redirect from there to loopback), and while the zip is larger than its update info says; then it updates with the zip on another origin.
 */
export async function runMacRequestRulesTest(context: TestContext): Promise<void> {
  await withEmptyUpdaterCaches(() =>
    runUpdateScenario(context, {
      target: "zip",
      packageManager: "",
      arch: Arch.arm64,
      toolsets: {},
      tmpDirPrefix: "request-rules",
      builds: [{ version: OLD_VERSION_NUMBER }, { version: NEW_VERSION_NUMBER }],
      initialUpdateConfig: () => Promise.resolve({}),
      scenario: async ctx => {
        const other = await ctx.servers.createOrigin()
        await expectCrossOriginHeadersRequired(ctx)
        await expectNonLoopbackFeedRules(ctx, other)
        await expectDownloadSizeLimit(ctx)
        await expectUpdateFromOtherOrigin(ctx, other)
      },
    })
  )
}

// ---------------------------------------------------------------------------------------------------------
// NSIS: the checks of the downloaded installer (#10600, #10601, #10580) and the modes of the install at launch (#10525)
// ---------------------------------------------------------------------------------------------------------

type NsisToolsets = Required<Pick<ToolsetConfig, "winCodeSign" | "nsis" | "wine">>

const MISSING_PUBLISHER_NAME_DOCS = "https://www.electron.build/docs/migration/v27-build-changes#missing-publishername-fails-update-verification"
const INSTALLER_VERSION_DOCS = "https://www.electron.build/docs/migration/v27-runtime-changes#nsis-update-installers-must-carry-the-updates-version"
/** The version the forged update info announces for the installer of 1.0.1. */
const FORGED_VERSION = THIRD_VERSION_NUMBER

/**
 * The app's own publisherName and a verifier that accepts the installer signed with the untrusted test certificate: the update is then
 * verified against a publisherName, which runs the check of its ProductVersion, on native Windows and in the VM alike.
 */
const VERIFIED_BY_STUB = { publisherName: WIN_SIGNING_PUBLISHER_NAME, authenticodeStub: "accept" } as const

/** The pending directory can only be read when the app runs on this machine, not in the Parallels VM. */
const isNativeWindows = () => process.platform === "win32"

/** Nothing of a failed download is left in the pending directory (native Windows only). */
async function expectNoPartialDownload(expect: ExpectStatic): Promise<void> {
  if (isNativeWindows()) {
    expect(await leftoverPartialDownloads(pendingUpdateDir(UPDATER_STORE_DIR_NAME))).toEqual([])
  }
}

/** The served update info announces FORGED_VERSION for the installer of 1.0.1 while `test` runs. */
async function withForgedVersion(rootDirectory: string, test: () => Promise<void>): Promise<void> {
  const restore = await rewriteServedManifests(rootDirectory, info => ({ ...info, version: FORGED_VERSION }))
  try {
    await test()
  } finally {
    await restore()
  }
}

function expectForgedVersionMismatch(expect: ExpectStatic, stdout: string): void {
  expect(stdout).toContain(`The installer of version ${FORGED_VERSION} is rejected: its ProductVersion is "${NEW_VERSION_NUMBER}"`)
  expect(stdout).toContain(INSTALLER_VERSION_DOCS)
}

function nsisScenario(context: TestContext, toolsets: NsisToolsets, tmpDirPrefix: string, scenario: (ctx: ScenarioContext) => Promise<void>): Promise<void> {
  return withEmptyUpdaterCaches(() =>
    runUpdateScenario(context, {
      target: "nsis",
      packageManager: "",
      arch: Arch.x64,
      toolsets,
      tmpDirPrefix,
      builds: [{ version: OLD_VERSION_NUMBER }, { version: NEW_VERSION_NUMBER }],
      initialUpdateConfig: () => Promise.resolve({}),
      scenario: async ctx => {
        // the pending directory of the checks is in the cache that the served config names and withEmptyUpdaterCaches empties
        ctx.expect(ctx.serverConfig.updaterCacheDirName).toBe(UPDATER_STORE_DIR_NAME)
        await scenario(ctx)
      },
    })
  )
}

/** The update is installed and its installer has written the package type (native Windows only). */
async function expectInstalledNsis(ctx: ScenarioContext): Promise<void> {
  if (isNativeWindows()) {
    await waitForWindowsProcessExit(NSIS_INSTALLER_IMAGE_NAME)
    ctx.expect(await readInstalledPackageType(ctx.appPath)).toBe("nsis")
  }
}

/** A full download of the installer larger than its declared size stops there (#10580), with nothing of it left behind. */
async function expectNsisDownloadSizeExceeded(ctx: ScenarioContext, variant: "declared size 1" | "one extra byte served"): Promise<void> {
  const { expect, rootDirectory } = ctx
  const { feed } = ctx.servers
  const restore = variant === "declared size 1" ? await rewriteServedManifests(rootDirectory, info => ({ ...info, files: info.files.map(file => ({ ...file, size: 1 })) })) : null
  if (variant === "one extra byte served") {
    // the limit trips on the last chunk, while the destination file is still open (which Windows does not let anyone remove)
    feed.setRouter(pathname => (pathname === `/${NSIS_INSTALLER_IMAGE_NAME}` ? { extraBytes: 1 } : null))
  }
  try {
    await expectRejectedUpdate(ctx, {
      installedVersion: OLD_VERSION_NUMBER,
      expectedErrorCode: "ERR_UPDATER_DOWNLOAD_SIZE_EXCEEDED",
      env: fixtureEnv(VERIFIED_BY_STUB),
      manifests: "unsigned",
      assertLaunch: stdout => {
        expect(stdout).toContain(DOWNLOAD_SIZE_DOCS)
        // the size limit, not the checksum of the whole file, stopped the download
        expect(stdout).not.toContain("sha512 checksum mismatch")
      },
    })
  } finally {
    feed.setRouter(null)
    await restore?.()
  }
  await expectNoPartialDownload(expect)
}

/**
 * The checks of a downloaded NSIS installer on a real electron-builder installer, with one build pair. A verifier that accepts the
 * untrusted test certificate (VERIFIED_BY_STUB) stands in for the Authenticode verification, so the case runs in the VM too:
 *   1. without a publisherName the update is rejected, and the verifier is not called (#10600)
 *   2. a full download larger than its declared size stops there (#10580)
 *   3. autoUpdater.publisherName wins over the served verifyUpdateCodeSignature: false, and an installer whose ProductVersion is not the
 *      version of the update info is rejected (#10600, #10601)
 *   4. the genuine update installs
 */
export async function runNsisInstallerChecksTest(context: TestContext, toolsets: NsisToolsets): Promise<void> {
  await nsisScenario(context, toolsets, "nsis-installer-checks", async ctx => {
    const { expect, rootDirectory, updateConfigPath, serverConfig } = ctx

    // neither publisherName nor the opt-out in the served config, and none set by the app
    await writeRawServedUpdateConfig(updateConfigPath, serverConfig)
    try {
      await expectRejectedUpdate(ctx, {
        installedVersion: OLD_VERSION_NUMBER,
        expectedErrorCode: "ERR_UPDATER_INVALID_SIGNATURE",
        env: fixtureEnv({ authenticodeStub: "accept" }),
        manifests: "unsigned",
        assertLaunch: stdout => {
          expect(stdout).toContain(`New version ${NEW_VERSION_NUMBER} is not signed by the application owner: The update is rejected: app-update.yml has no publisherName`)
          expect(stdout).toContain(MISSING_PUBLISHER_NAME_DOCS)
          expect(authenticodeStubCalls(stdout), "a custom verifier is called only with a publisherName").toEqual([])
        },
      })
    } finally {
      await writeServedUpdateConfig(updateConfigPath, serverConfig)
    }
    await expectNoPartialDownload(expect)

    await expectNsisDownloadSizeExceeded(ctx, "declared size 1")
    await expectNsisDownloadSizeExceeded(ctx, "one extra byte served")

    // the served config has verifyUpdateCodeSignature: false (writeServedUpdateConfig)
    await withForgedVersion(rootDirectory, () =>
      expectRejectedUpdate(ctx, {
        installedVersion: OLD_VERSION_NUMBER,
        expectedErrorCode: "ERR_UPDATER_INSTALLER_VERSION_MISMATCH",
        env: fixtureEnv(VERIFIED_BY_STUB),
        manifests: "unsigned",
        assertLaunch: stdout => {
          expect(authenticodeStubCalls(stdout), "the update is verified against autoUpdater.publisherName").toEqual([{ publisherNames: [WIN_SIGNING_PUBLISHER_NAME] }])
          expectForgedVersionMismatch(expect, stdout)
        },
      })
    )
    await expectNoPartialDownload(expect)

    await updateHop(expect, {
      ...ctx,
      fromVersion: OLD_VERSION_NUMBER,
      toVersion: NEW_VERSION_NUMBER,
      env: fixtureEnv(VERIFIED_BY_STUB),
      assertLaunch: stdout => expect(authenticodeStubCalls(stdout)).toEqual([{ publisherNames: [WIN_SIGNING_PUBLISHER_NAME] }]),
    })
    await expectInstalledNsis(ctx)
  })
}

/** One launch of the installed 1.0.0 with `knobs`. */
async function launchInstalled(ctx: ScenarioContext, knobs: FixtureUpdaterKnobs, check: (stdout: string) => void): Promise<void> {
  const { expect, appPath, vm, updateConfigPath, packageManager } = ctx
  const result = await launchAndWaitForQuit({
    appPath,
    vm,
    timeoutMs: 5 * 60 * 1000,
    updateConfigPath,
    expectedVersion: OLD_VERSION_NUMBER,
    packageManagerToTest: packageManager,
    waitForExit: true,
    env: fixtureEnv(knobs),
  })
  await result.assert(() => {
    expect(result.version).toMatch(OLD_VERSION_NUMBER)
    check(result.stdout)
  })
}

async function expectInstalledVersion(ctx: ScenarioContext, version: string): Promise<void> {
  const { expect, appPath, vm, updateConfigPath, packageManager } = ctx
  const probe = await launchAndWaitForQuit({
    appPath,
    vm,
    timeoutMs: 60 * 1000,
    updateConfigPath,
    packageManagerToTest: packageManager,
    env: { AUTO_UPDATER_TEST: "" }, // disables updater — app prints version and quits
    waitForExit: true,
  })
  await probe.assert(() => expect(probe.version).toMatch(version))
}

/** The update is downloaded and queued with quitAndInstall({ waitUntilNextLaunch: true }); nothing is installed. */
async function queueForNextLaunch(ctx: ScenarioContext, knobs: FixtureUpdaterKnobs, check?: (stdout: string) => void): Promise<void> {
  const { expect } = ctx
  await launchInstalled(ctx, { ...knobs, nextLaunch: true }, stdout => {
    expect(stdout).toContain("Deferring install to next launch on explicit quitAndInstall (waitUntilNextLaunch)")
    expect(stdout).toContain("Update is marked for install on next launch")
    check?.(stdout)
  })
  await expectInstalledVersion(ctx, OLD_VERSION_NUMBER)
}

/**
 * A pending-only launch with autoInstallEvent "manual" leaves a queued update alone (#10525): it sends no request and the update stays
 * marked for the next launch. `cacheDirName` is the updater cache of the app.
 */
async function expectManualModeKeepsPendingUpdate(ctx: ScenarioContext, knobs: FixtureUpdaterKnobs, cacheDirName: string, isNative: boolean): Promise<void> {
  const { expect } = ctx
  const servers = [ctx.servers.feed, ...ctx.servers.origins]
  for (const server of servers) {
    server.clearRequests()
  }
  await launchInstalled(ctx, { ...knobs, pendingOnly: { quitAfterMs: 15_000 }, autoInstallEvent: "manual" }, stdout => {
    expect(stdout).toContain("AUTO_INSTALL_ON_NEXT_LAUNCH_TIMEOUT")
  })
  expect(
    servers.flatMap(server => server.requests),
    "the launch in manual mode sends no request"
  ).toEqual([])
  if (isNative) {
    expect(await readJson(path.join(pendingUpdateDir(cacheDirName), "update-info.json"))).toMatchObject({ installOnNextLaunch: true })
  }
  await expectInstalledVersion(ctx, OLD_VERSION_NUMBER)
}

/**
 * The install at launch of an update queued with waitUntilNextLaunch, in its modes (#10525) and with a forged version (#10601). Every
 * launch has VERIFIED_BY_STUB, so the pending installer is verified again at launch, ProductVersion included:
 *   1. queued; 2. a pending-only launch (default autoInstallEvent "onQuit") against update info that announces another version for the
 *   installer rejects it and clears the pending update; 3. queued again; 4. "manual" leaves it alone; 5. the default installs it.
 */
export async function runNsisNextLaunchModesTest(context: TestContext, toolsets: NsisToolsets): Promise<void> {
  await nsisScenario(context, toolsets, "nsis-next-launch-modes", async ctx => {
    const { expect, rootDirectory } = ctx
    const pendingDir = pendingUpdateDir(UPDATER_STORE_DIR_NAME)
    await queueForNextLaunch(ctx, VERIFIED_BY_STUB)

    await withForgedVersion(rootDirectory, () =>
      launchInstalled(ctx, { ...VERIFIED_BY_STUB, pendingOnly: { quitAfterMs: 20_000 } }, stdout => {
        expect(stdout).toContain("Update is marked for install on next launch, validating it against the latest update info")
        expect(stdout).toContain("ERR_UPDATER_INSTALLER_VERSION_MISMATCH")
        expectForgedVersionMismatch(expect, stdout)
        expect(stdout).not.toContain("Installing pending update")
      })
    )
    if (isNativeWindows()) {
      expect(await readdir(pendingDir), "the rejected pending update is cleared").toEqual([])
    }
    await expectInstalledVersion(ctx, OLD_VERSION_NUMBER)

    await queueForNextLaunch(ctx, VERIFIED_BY_STUB)
    await expectManualModeKeepsPendingUpdate(ctx, VERIFIED_BY_STUB, UPDATER_STORE_DIR_NAME, isNativeWindows())

    // the quit timeout also ends the app that the installer starts again (--force-run), which inherits this env
    await launchInstalled(ctx, { ...VERIFIED_BY_STUB, pendingOnly: { quitAfterMs: 20_000 } }, stdout => {
      expect(countOf(stdout, `Installing pending update ${NEW_VERSION_NUMBER} on launch`)).toBe(1)
      expect(authenticodeStubCalls(stdout)).toEqual([{ publisherNames: [WIN_SIGNING_PUBLISHER_NAME] }])
      expect(stdout).toMatch(/Executing: .*\\pending\\TestApp Setup\.exe with args: --updated,\/S,--force-run/i)
    })
    await pollUntilNewVersionInstalled(expect, { ...ctx, packageManagerToTest: ctx.packageManager, expectedVersion: NEW_VERSION_NUMBER })
    await expectInstalledNsis(ctx)
  })
}

/**
 * electron-updater's own Authenticode verification (Get-AuthenticodeSignature) of a real installer, with the test certificate trusted in
 * LocalMachine\Root (native Windows, elevated; skipped otherwise): a publisherName that is not the signer rejects it, a valid signature
 * does not exempt an installer with another ProductVersion (#10601), and the update installs when verified against autoUpdater.publisherName
 * alone (#10600).
 */
export async function runNsisAuthenticodeTest(context: TestContext, toolsets: NsisToolsets): Promise<void> {
  const trusted = await trustSigningIdentityInMachineRoot(await getWindowsSigningIdentity(), context.tmpDir)
  if (trusted == null) {
    context.skip()
    return
  }
  try {
    await nsisScenario(context, toolsets, "nsis-authenticode", async ctx => {
      const { expect, outDirs, rootDirectory, updateConfigPath, serverConfig } = ctx

      await writeServedUpdateConfig(updateConfigPath, { ...serverConfig, publisherName: ["CN=Somebody Else"] })
      await expectRejectedUpdate(ctx, {
        installedVersion: OLD_VERSION_NUMBER,
        expectedErrorCode: "ERR_UPDATER_INVALID_SIGNATURE",
        manifests: "unsigned",
        assertLaunch: stdout => {
          expect(stdout).toContain("Sign verification failed, installer signed with incorrect certificate")
          expect(stdout).toContain("publisherNames: CN=Somebody Else")
        },
      })
      await expectNoPartialDownload(expect)

      // the publisherName that the build embedded: the signature verifies, the ProductVersion does not match
      const { publisherName } = await readEmbeddedUpdateConfig(outDirs[0].dir)
      await writeServedUpdateConfig(updateConfigPath, { ...serverConfig, publisherName })
      await withForgedVersion(rootDirectory, () =>
        expectRejectedUpdate(ctx, {
          installedVersion: OLD_VERSION_NUMBER,
          expectedErrorCode: "ERR_UPDATER_INSTALLER_VERSION_MISMATCH",
          manifests: "unsigned",
          assertLaunch: stdout => {
            expect(stdout).toContain("Verifying signature")
            expect(stdout).not.toContain("Sign verification failed")
            expectForgedVersionMismatch(expect, stdout)
          },
        })
      )

      // neither publisherName nor the opt-out in the served config: verified against autoUpdater.publisherName
      await writeRawServedUpdateConfig(updateConfigPath, serverConfig)
      await updateHop(expect, { ...ctx, fromVersion: OLD_VERSION_NUMBER, toVersion: NEW_VERSION_NUMBER, env: fixtureEnv({ publisherName: WIN_SIGNING_PUBLISHER_NAME }) })
      await expectInstalledNsis(ctx)
    })
  } finally {
    await trusted.untrust()
  }
}

// ---------------------------------------------------------------------------------------------------------
// AppImage: the request rules (#10563, #10566) on a differential update, and the modes of the install at launch (#10525)
// ---------------------------------------------------------------------------------------------------------

/**
 * The update is queued for the next launch while the feed redirects the AppImage (and its block map) to `other`: the differential
 * download's range requests go there without the Authorization and the custom header that the feed gets (#10563).
 */
async function queueFromOtherOrigin(ctx: ScenarioContext, other: LocalServer): Promise<void> {
  const { expect, rootDirectory } = ctx
  const { feed } = ctx.servers
  const appImagePath = `/${(await readUpdateManifest(rootDirectory)).files[0].url}`
  feed.setRouter(pathname => (pathname.startsWith(appImagePath) ? { redirectTo: `${other.url}${pathname}` } : null))
  feed.clearRequests()
  other.clearRequests()
  try {
    await queueForNextLaunch(ctx, { requestHeaders: APP_REQUEST_HEADERS, authHeader: `Bearer ${AUTH_SECRET}` }, stdout => {
      assertDifferentialDownload(expect, stdout)
      expect(countOf(stdout, leftOutHeadersWarning(feed, other)), "the warning about the headers left out for the other origin").toBe(1)
    })
  } finally {
    feed.setRouter(null)
  }
  await Promise.all([feed.settled(), other.settled()])
  expect(
    other.requests.some(it => it.headerNames.includes("range")),
    "the differential download sends its range requests to the other origin"
  ).toBe(true)
  for (const { pathname, headerNames } of other.requests) {
    expect(headerNames, `the headers of ${pathname} on the other origin`).not.toContain("authorization")
    expect(headerNames, `the headers of ${pathname} on the other origin`).not.toContain("x-tenant")
  }
}

/**
 * The request rules of electron-updater 7 on a real AppImage update (Electron's net, a differential download), and the install at launch
 * of the update queued with waitUntilNextLaunch: "manual" leaves it alone, the default autoInstallEvent ("onQuit") installs it (#10525).
 */
export async function runAppImageRequestRulesTest(context: TestContext, arch: Arch, toolsets: ToolsetConfig): Promise<void> {
  await withEmptyUpdaterCaches(() =>
    runUpdateScenario(context, {
      target: "AppImage",
      packageManager: "appimage",
      arch,
      toolsets,
      tmpDirPrefix: "appimage-request-rules",
      builds: [{ version: OLD_VERSION_NUMBER }, { version: NEW_VERSION_NUMBER }],
      // the AppImage embeds its app-update.yml, so the served config names its updater cache, which withEmptyUpdaterCaches empties
      initialUpdateConfig: () => Promise.resolve({ updaterCacheDirName: UPDATER_STORE_DIR_NAME }),
      scenario: async ctx => {
        const { expect } = ctx
        const other = await ctx.servers.createOrigin()
        await expectCrossOriginHeadersRequired(ctx)
        await expectNonLoopbackFeedRules(ctx, other)
        await queueFromOtherOrigin(ctx, other)
        await expectManualModeKeepsPendingUpdate(ctx, {}, UPDATER_STORE_DIR_NAME, true)

        await launchInstalled(ctx, { pendingOnly: { quitAfterMs: 20_000 } }, stdout => {
          expect(countOf(stdout, `Installing pending update ${NEW_VERSION_NUMBER} on launch`)).toBe(1)
          expect(stdout).toMatch(/Executing: .*\.AppImage with args: /)
        })
        await pollUntilNewVersionInstalled(expect, { ...ctx, packageManagerToTest: ctx.packageManager, expectedVersion: NEW_VERSION_NUMBER })
      },
    })
  )
}
