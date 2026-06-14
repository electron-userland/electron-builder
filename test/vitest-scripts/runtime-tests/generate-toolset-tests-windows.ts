import type { ToolsetConfig } from "app-builder-lib/internal"
import * as fs from "fs"
import * as path from "path"
import type * as _BlackboxWinSuite from "../../src/updater/blackboxUpdateWinSuite.js"
import type * as _DifferentialWinSuite from "../../src/updater/differentialUpdateWinSuite.js"
import type * as _AppxSuite from "../../src/windows/appxTestSuite.js"
import type * as _AssistedInstallerSuite from "../../src/windows/assistedInstallerTestSuite.js"
import type * as _MsiSuite from "../../src/windows/msiTestSuite.js"
import type * as _MsiWrappedSuite from "../../src/windows/msiWrappedTestSuite.js"
import type * as _PortableSuite from "../../src/windows/portableTestSuite.js"
import type * as _SquirrelWindowsSuite from "../../src/windows/squirrelWindowsTestSuite.js"
import type * as _WinCodeSignSuite from "../../src/windows/winCodeSignTestSuite.js"
import type * as _WinPackagerSuite from "../../src/windows/winPackagerTestSuite.js"
import type { SuiteConfig } from "./generate-toolset-tests-shared.js"
import { buildDescribeCall, cleanAndEnsureDir, GENERATED_TESTS_DIR, getPlatformSuffix, namedFn, resolveImportPath, TEST_SRC_DIR } from "./generate-toolset-tests-shared.js"
import { NSIS_VERSIONS, WINE_VERSIONS, WIN_CODE_SIGN_VERSIONS, WIX_VERSIONS } from "./generate-toolset-versions.js"

interface WindowsSuiteConfig extends SuiteConfig {
  readonly winCodeSignVersions?: ToolsetConfig["winCodeSign"][]
  readonly nsisVersions?: ToolsetConfig["nsis"][]
  readonly wineVersions?: ToolsetConfig["wine"][]
  readonly wixVersions?: any /* ToolsetConfig["wix"] */[]
}

const SUITES: WindowsSuiteConfig[] = [
  {
    name: "winPackager",
    registerFn: namedFn("registerWinPackagerTests" satisfies keyof typeof _WinPackagerSuite),
    importPath: "windows/winPackagerTestSuite",
    describeConfig: { name: "winPackager", chain: ["ifWindowsOrWine"] },
    nsisVersions: NSIS_VERSIONS,
    wineVersions: WINE_VERSIONS,
  },
  {
    name: "portable",
    registerFn: namedFn("registerPortableTests" satisfies keyof typeof _PortableSuite),
    importPath: "windows/portableTestSuite",
    describeConfig: { name: "portable", chain: ["ifWindows"] },
    nsisVersions: NSIS_VERSIONS,
  },
  {
    name: "assistedInstaller",
    registerFn: namedFn("registerAssistedInstallerTests" satisfies keyof typeof _AssistedInstallerSuite),
    importPath: "windows/assistedInstallerTestSuite",
    describeConfig: { name: "assisted", chain: ["ifWindowsOrWine"] },
    // sequential: tests share ~/wine-test WINEPREFIX; concurrent access causes wineboot --init races
    describeOptions: { sequential: true },
    nsisVersions: NSIS_VERSIONS,
    wineVersions: WINE_VERSIONS,
  },
  {
    name: "msi",
    registerFn: namedFn("registerMsiTests" satisfies keyof typeof _MsiSuite),
    importPath: "windows/msiTestSuite",
    describeConfig: { name: "msi", chain: ["ifWindows"] },
    describeOptions: { sequential: true },
    wixVersions: WIX_VERSIONS,
    winCodeSignVersions: [], // MSI does not use winCodeSign
  },
  {
    name: "msiWrapped",
    registerFn: namedFn("registerMsiWrappedTests" satisfies keyof typeof _MsiWrappedSuite),
    importPath: "windows/msiWrappedTestSuite",
    describeConfig: { name: "msiWrapped", chain: ["ifWindows"] },
    describeOptions: { sequential: true },
    nsisVersions: NSIS_VERSIONS,
    wineVersions: WINE_VERSIONS,
  },
  {
    name: "squirrelWindows",
    registerFn: namedFn("registerSquirrelWindowsTests" satisfies keyof typeof _SquirrelWindowsSuite),
    importPath: "windows/squirrelWindowsTestSuite",
    describeConfig: { name: "squirrel-windows", chain: ["ifWindows"] },
    describeOptions: { sequential: true },
  },
  {
    name: "appx",
    registerFn: namedFn("registerAppxTests" satisfies keyof typeof _AppxSuite),
    importPath: "windows/appxTestSuite",
    describeConfig: { name: "AppX", chain: ["ifWindows"] },
    winCodeSignVersions: WIN_CODE_SIGN_VERSIONS.filter(version => version !== "0.0.0"), // AppX tests are currently incompatible with win-codesign 0.0.0 due to bundled osslsigncode version differences
  },
  {
    name: "differentialWin",
    registerFn: namedFn("registerDifferentialWinTests" satisfies keyof typeof _DifferentialWinSuite),
    importPath: "updater/differentialUpdateWinSuite",
    describeConfig: { name: "differential-win", chain: ["ifWindows"] },
    describeOptions: { sequential: true },
    nsisVersions: NSIS_VERSIONS,
  },
  {
    name: "blackboxWin",
    registerFn: namedFn("registerBlackboxWinTests" satisfies keyof typeof _BlackboxWinSuite),
    importPath: "updater/blackboxUpdateWinSuite",
    describeConfig: { name: "blackboxWin" },
    describeOptions: { sequential: true, retry: 1 },
    nsisVersions: NSIS_VERSIONS,
    wineVersions: WINE_VERSIONS,
  },
  {
    name: "winCodeSign",
    registerFn: namedFn("registerWinCodeSignTests" satisfies keyof typeof _WinCodeSignSuite),
    importPath: "windows/winCodeSignTestSuite",
    describeConfig: { name: "winCodeSign" },
    describeOptions: { sequential: true },
  },
]

function renderFile({
  suite,
  winCodeSign,
  nsis,
  wine,
  wix,
}: {
  suite: WindowsSuiteConfig
  winCodeSign: ToolsetConfig["winCodeSign"] | undefined
  nsis?: ToolsetConfig["nsis"]
  wine?: ToolsetConfig["wine"]
  wix?: any /* ToolsetConfig["wix"] */
}): string {
  const fnName = suite.registerFn.name
  const toolsets: Record<string, unknown> = {}
  if (winCodeSign !== undefined) {
    toolsets.winCodeSign = winCodeSign
  }
  if (nsis !== undefined) {
    toolsets.nsis = nsis
  }
  if (wine !== undefined) {
    toolsets.wine = wine
  }
  if (wix !== undefined) {
    toolsets.wix = wix
  }
  const toolsetsArg = JSON.stringify(toolsets)
  const describeCall = buildDescribeCall(suite.describeConfig.chain)
  const optionsPart = suite.describeOptions ? `, ${JSON.stringify(suite.describeOptions)}` : ""

  const body = `${describeCall}("${suite.describeConfig.name}"${optionsPart}, () => {
  ${fnName}(${toolsetsArg})
})`

  const generatedDir = path.resolve(GENERATED_TESTS_DIR, suite.name)
  const importPath = resolveImportPath(generatedDir, TEST_SRC_DIR, suite.importPath)
  return `// @generated — do not edit. Regenerated by generate-toolset-tests-windows.ts on each test run.
import { ${fnName} } from "${importPath}"

${body}
`
}

export const WINDOWS_SUITE_METADATA = SUITES.map(s => ({ name: s.name, chain: s.describeConfig.chain }))

export function generateWindowsToolsetTests(): void {
  for (const suite of SUITES) {
    const generatedDir = path.resolve(GENERATED_TESTS_DIR, suite.name)
    cleanAndEnsureDir(generatedDir)
    const platformSuffix = getPlatformSuffix(suite.describeConfig.chain)

    // Suites with an explicit wixVersions list are driven solely by the wix dimension.
    if (suite.wixVersions) {
      for (const wix of suite.wixVersions) {
        const filename = `${suite.name}__wix-${wix}${platformSuffix}Test.ts`
        fs.writeFileSync(path.join(generatedDir, filename), renderFile({ suite, winCodeSign: undefined, nsis: undefined, wine: undefined, wix }), "utf8")
      }
      continue
    }

    const wcsVersions = suite.winCodeSignVersions ?? WIN_CODE_SIGN_VERSIONS
    const nsisVersions = suite.nsisVersions
    const wineVersions = suite.wineVersions
    if (nsisVersions) {
      for (const nsis of nsisVersions) {
        for (const wcs of wcsVersions) {
          if (wineVersions) {
            for (const wine of wineVersions) {
              const filename = `${suite.name}__wcs-${wcs}__nsis-${nsis}__wine-${wine}${platformSuffix}Test.ts`
              fs.writeFileSync(path.join(generatedDir, filename), renderFile({ suite, winCodeSign: wcs, nsis, wine }), "utf8")
            }
          } else {
            const filename = `${suite.name}__wcs-${wcs}__nsis-${nsis}${platformSuffix}Test.ts`
            fs.writeFileSync(path.join(generatedDir, filename), renderFile({ suite, winCodeSign: wcs, nsis }), "utf8")
          }
        }
      }
    } else {
      for (const wcs of wcsVersions) {
        const filename = `${suite.name}__wcs-${wcs}${platformSuffix}Test.ts`
        fs.writeFileSync(path.join(generatedDir, filename), renderFile({ suite, winCodeSign: wcs }), "utf8")
      }
    }
  }
}
