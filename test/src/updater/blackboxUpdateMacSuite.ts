import { exec, TmpDir } from "builder-util"
import { Arch } from "electron-builder"
import { afterAll, ExpectStatic, TestContext } from "vitest"
import { NEW_VERSION_NUMBER, OLD_VERSION_NUMBER } from "../helpers/updaterTestUtil"
import { macAppBundle } from "./blackboxInstallMac"
import {
  ApplicationUpdatePaths,
  doBuild,
  generateManifestSigningKeys,
  keyRotationBuilds,
  optionsForFlakyE2E,
  optionsForFlakyMultiHopE2E,
  PrebuiltApps,
  runKeyRotationTest,
  runSignedManifestTest,
  runUpdateScenario,
  updateHop,
  VersionBuild,
  withEmptyUpdaterCaches,
} from "./blackboxUpdateHelpers"
import { runMacRequestRulesTest } from "./blackboxUpdateRuntimeChecks"
import { resignManifest, rewriteServedManifests } from "./signedManifestTestUtil"

/** Time one build of the test app may add to the case that makes it: ~3 min arm64, ~5 min x64 (Rosetta), ~7 min universal on the macOS CI runner. */
const BUILD_TIMEOUT = 6 * 60 * 1000

/**
 * The builds of one mac blackbox file, made once by the first case that runs and shared by every case of the file. A build (fixture
 * copy, install, native rebuild, signing, zip) is most of the time of a case, and the cases of a file update between the same apps.
 */
class SharedMacBuilds {
  private outDirs: Promise<Array<ApplicationUpdatePaths>> | null = null
  private readonly tmpDirs: Array<TmpDir> = []

  constructor(
    private readonly arch: Arch,
    private readonly versions: Array<VersionBuild>
  ) {}

  /**
   * Builds on the first call, so assertPack records the snapshots of the builds under the case that runs first. A failed build is made
   * again by the next attempt (a retry, or the next case).
   */
  private build(expect: ExpectStatic): Promise<Array<ApplicationUpdatePaths>> {
    if (this.outDirs == null) {
      // outlives the case that builds (the tmpDir fixture of a case is removed when it ends): removed by cleanup() once the file is done
      const tmpDir = new TmpDir("mac-update-builds")
      this.tmpDirs.push(tmpDir)
      const outDirs: Array<ApplicationUpdatePaths> = []
      this.outDirs = doBuild(expect, outDirs, "zip", this.arch, tmpDir, false, { toolsets: {} }, this.versions).then(
        () => outDirs,
        error => {
          this.outDirs = null
          throw error
        }
      )
    }
    return this.outDirs
  }

  /**
   * The builds, and a fresh copy of the app of the first one in the case's tmpDir, which the case installs: Squirrel.Mac replaces the
   * installed app in place, so a case must not install the shared build itself.
   */
  async forCase({ expect, tmpDir }: TestContext): Promise<PrebuiltApps> {
    const outDirs = await this.build(expect)
    const installDir = await tmpDir.getTempDir({ prefix: "installed-app" })
    // ditto keeps the symlinks of the bundle's frameworks and its code signature, which Squirrel.Mac compares with the update's
    await exec("ditto", [macAppBundle(outDirs[0].dir, this.arch), macAppBundle(installDir, this.arch)])
    return { outDirs, installDir }
  }

  async cleanup(): Promise<void> {
    await Promise.all(this.tmpDirs.map(it => it.cleanup()))
  }
}

/**
 * The update of runTest (blackboxUpdateHelpers.ts) for a mac zip: the installed 1.0.0 downloads 1.0.1 and Squirrel.Mac installs it. `unsignManifest`: the
 * shared 1.0.1 was built with a signed manifest, which is served without its signatures, as an unsigned build writes it.
 */
async function runMacUpdateTest(context: TestContext, arch: Arch, builds: Array<VersionBuild>, prebuilt: PrebuiltApps, unsignManifest: boolean): Promise<void> {
  await runUpdateScenario(context, {
    target: "zip",
    packageManager: "",
    arch,
    toolsets: {},
    tmpDirPrefix: "auto-update",
    builds,
    prebuilt,
    initialUpdateConfig: () => Promise.resolve({}),
    scenario: async ctx => {
      if (unsignManifest) {
        await rewriteServedManifests(ctx.rootDirectory, info => resignManifest(info, []))
      }
      await updateHop(ctx.expect, { ...ctx, fromVersion: OLD_VERSION_NUMBER, toVersion: NEW_VERSION_NUMBER })
    },
  })
}

type MacBlackboxCase = {
  options: typeof optionsForFlakyE2E | typeof optionsForFlakyMultiHopE2E
  run: (context: TestContext, apps: PrebuiltApps) => Promise<void>
}

type MacBlackboxFile = {
  arch: Arch
  /** Squirrel.Mac only updates an arm64 build on an arm64 host, so the cases are a no-op elsewhere (and build nothing). */
  arm64HostOnly?: boolean
  /** the builds the cases share */
  versions: Array<VersionBuild>
  /** each name is also the vitest test name (and so part of the snapshot key) */
  cases: Record<string, MacBlackboxCase>
}

/** An update pair whose builds are both stored: compression takes no part in what these cases check, and costs build time. */
const STORED_UPDATE_PAIR: Array<VersionBuild> = [
  { version: OLD_VERSION_NUMBER, compression: "store" },
  { version: NEW_VERSION_NUMBER, compression: "store" },
]

const macBlackboxFiles = {
  x64: (): MacBlackboxFile => {
    // Every x64 case updates between the builds of the key rotation (1.0.0 signed by A, 1.0.1 by [A, B], 1.0.2 by B), with the served
    // manifests re-signed where a case needs other signatures. 1.0.1 is the one mac update build compressed at "maximum" (the level
    // doBuild gives every build after the first by default), so a Squirrel.Mac install of such a zip stays covered; the others are stored.
    const keys = generateManifestSigningKeys()
    const versions: Array<VersionBuild> = keyRotationBuilds(keys).map(build => ({ ...build, compression: build.version === NEW_VERSION_NUMBER ? "maximum" : "store" }))
    return {
      arch: Arch.x64,
      versions,
      cases: {
        x64: { options: optionsForFlakyE2E, run: (context, apps) => runMacUpdateTest(context, Arch.x64, versions, apps, true) },
        // Ed25519-signed latest-mac.yml: the installed app verifies the manifest before updating.
        "x64 - signed update manifest": { options: optionsForFlakyE2E, run: (context, apps) => runSignedManifestTest(context, "zip", "", Arch.x64, {}, { keys, apps }) },
        // Key rotation A → [A, B] → B over the three builds, including manifests the installed app must refuse.
        "x64 - key rotation": { options: optionsForFlakyMultiHopE2E, run: (context, apps) => runKeyRotationTest(context, "zip", "", Arch.x64, {}, { keys, apps }) },
      },
    }
  },
  arm64: (): MacBlackboxFile => ({
    arch: Arch.arm64,
    arm64HostOnly: true,
    versions: STORED_UPDATE_PAIR,
    cases: {
      arm64: { options: optionsForFlakyE2E, run: (context, apps) => runMacUpdateTest(context, Arch.arm64, STORED_UPDATE_PAIR, apps, false) },
      // The request rules of electron-updater 7 over five refused launches and the update (see runMacRequestRulesTest).
      "arm64 - update request rules": { options: optionsForFlakyMultiHopE2E, run: runMacRequestRulesTest },
    },
  }),
  universal: (): MacBlackboxFile => ({
    arch: Arch.universal,
    versions: STORED_UPDATE_PAIR,
    cases: {
      universal: { options: optionsForFlakyE2E, run: (context, apps) => runMacUpdateTest(context, Arch.universal, STORED_UPDATE_PAIR, apps, false) },
    },
  }),
}

export type MacBlackboxFileName = keyof typeof macBlackboxFiles

/**
 * Registers the mac blackbox auto-update cases of one file (`test/src/updater/mac/blackboxUpdate<Arch>.e2e.ts`) under `mac auto-update`.
 * Every case is a full install → launch → update cycle of the test app; the cases of a file share one set of builds of one arch (see
 * SharedMacBuilds), and the CI sharder bin-packs whole files, so the archs land on different shards. Snapshot keys are
 * `mac > mac auto-update > <first case> N`: the first case to run makes the builds.
 */
export function registerBlackboxMacTests(name: MacBlackboxFileName): void {
  const { arch, arm64HostOnly, versions, cases } = macBlackboxFiles[name]()
  const builds = new SharedMacBuilds(arch, versions)
  describe("mac auto-update", () => {
    afterAll(() => builds.cleanup())
    for (const [caseName, { options, run }] of Object.entries(cases)) {
      const testFn = arm64HostOnly ? test.ifEnv(process.arch === "arm64") : test
      // whichever attempt runs first also makes the builds
      testFn(caseName, { ...options, timeout: options.timeout + versions.length * BUILD_TIMEOUT }, async context => {
        const apps = await builds.forCase(context)
        // the cases update between the same builds: without the update an earlier case left in the updater cache, each downloads its own
        await withEmptyUpdaterCaches(() => run(context, apps))
      })
    }
  })
}
