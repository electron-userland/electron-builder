import * as fs from "fs"
import * as path from "path"
import type { ToolsetConfig } from "app-builder-lib/internal"
import { buildDescribeCall, cleanAndEnsureDir, GENERATED_TESTS_DIR, getPlatformSuffix, namedFn, resolveImportPath, TEST_SRC_DIR } from "./generate-toolset-tests-shared"
import type { SuiteConfig } from "./generate-toolset-tests-shared"
import type * as _WinPackagerSuite from "../src/windows/winPackagerTestSuite"
import type * as _PortableSuite from "../src/windows/portableTestSuite"
import type * as _AssistedInstallerSuite from "../src/windows/assistedInstallerTestSuite"
import type * as _MsiSuite from "../src/windows/msiTestSuite"
import type * as _MsiWrappedSuite from "../src/windows/msiWrappedTestSuite"
import type * as _SquirrelWindowsSuite from "../src/windows/squirrelWindowsTestSuite"
import type * as _AppxSuite from "../src/windows/appxTestSuite"
import type * as _DifferentialWinSuite from "../src/updater/differentialUpdateWinSuite"
import type * as _BlackboxWinSuite from "../src/updater/blackboxUpdateWinSuite"
import type * as _WinCodeSignSuite from "../src/windows/winCodeSignTestSuite"

const WIN_CODE_SIGN_VERSIONS: ToolsetConfig["winCodeSign"][] = ["0.0.0", "1.0.0", "1.1.0", "1.2.1", "1.3.0"]
const NSIS_VERSIONS: ToolsetConfig["nsis"][] = ["0.0.0", "1.2.1", "2.0.0"]

interface WindowsSuiteConfig extends SuiteConfig {
  readonly winCodeSignVersions?: ToolsetConfig["winCodeSign"][]
  readonly nsisVersions?: ToolsetConfig["nsis"][]
}

const SUITES: WindowsSuiteConfig[] = [
  {
    name: "winPackager",
    registerFn: namedFn("registerWinPackagerTests" satisfies keyof typeof _WinPackagerSuite),
    importPath: "windows/winPackagerTestSuite",
    describeConfig: { name: "winPackager" },
    nsisVersions: NSIS_VERSIONS,
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
    describeConfig: { name: "assisted", chain: ["ifWindows"] },
    nsisVersions: NSIS_VERSIONS,
  },
  {
    name: "msi",
    registerFn: namedFn("registerMsiTests" satisfies keyof typeof _MsiSuite),
    importPath: "windows/msiTestSuite",
    describeConfig: { name: "msi", chain: ["ifWindows"] },
    describeOptions: { sequential: true },
  },
  {
    name: "msiWrapped",
    registerFn: namedFn("registerMsiWrappedTests" satisfies keyof typeof _MsiWrappedSuite),
    importPath: "windows/msiWrappedTestSuite",
    describeConfig: { name: "msiWrapped", chain: ["ifWindows"] },
    describeOptions: { sequential: true },
    nsisVersions: NSIS_VERSIONS,
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
    winCodeSignVersions: ["1.0.0", "1.1.0", "1.2.1", "1.3.0"],
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
  },
  {
    name: "winCodeSign",
    registerFn: namedFn("registerWinCodeSignTests" satisfies keyof typeof _WinCodeSignSuite),
    importPath: "windows/winCodeSignTestSuite",
    describeConfig: { name: "winCodeSign" },
    describeOptions: { sequential: true },
  },
]

function renderFile(suite: WindowsSuiteConfig, winCodeSign: ToolsetConfig["winCodeSign"], nsis?: ToolsetConfig["nsis"]): string {
  const fnName = suite.registerFn.name
  const toolsets: Record<string, unknown> = { winCodeSign }
  if (nsis !== undefined) {
    toolsets.nsis = nsis
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

export function generateWindowsToolsetTests(): void {
  for (const suite of SUITES) {
    const generatedDir = path.resolve(GENERATED_TESTS_DIR, suite.name)
    cleanAndEnsureDir(generatedDir)
    const wcsVersions = suite.winCodeSignVersions ?? WIN_CODE_SIGN_VERSIONS
    const nsisVersions = suite.nsisVersions
    const platformSuffix = getPlatformSuffix(suite.describeConfig.chain)
    if (nsisVersions) {
      for (const nsis of nsisVersions) {
        for (const wcs of wcsVersions) {
          const filename = `${suite.name}__wcs-${wcs}__nsis-${nsis}${platformSuffix}Test.ts`
          fs.writeFileSync(path.join(generatedDir, filename), renderFile(suite, wcs, nsis), "utf8")
        }
      }
    } else {
      for (const wcs of wcsVersions) {
        const filename = `${suite.name}__wcs-${wcs}${platformSuffix}Test.ts`
        fs.writeFileSync(path.join(generatedDir, filename), renderFile(suite, wcs), "utf8")
      }
    }
  }
}
