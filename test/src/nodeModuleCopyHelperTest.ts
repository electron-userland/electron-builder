import { FileMatcher } from "app-builder-lib/internal"
import type { NodeModuleInfo } from "app-builder-lib/src/node-module-collector/types"
import type { PlatformPackager } from "app-builder-lib/src/platformPackager"
import { NodeModuleCopyHelper } from "app-builder-lib/src/util/NodeModuleCopyHelper"
import type { Filter } from "builder-util"
import fsExtra from "fs-extra"
import * as path from "path"
import { vi } from "vitest"

// Regression coverage for https://github.com/electron-userland/electron-builder/issues/10169:
// `collectNodeModules` used to run a synchronous `lstat(dirPath)` for every child of a directory (all identical)
// and treated an async `onNodeModuleFile` hook as always-truthy (`!!Promise`). The directory check is now lazy,
// async and memoized per directory, and the hook result is awaited.

const EXCLUDED_EXTS = [".d.ts"]
const MODULE_NAME = "foo"
// mirrors what `getNodeModuleFileMatcher` builds: only negations from `files`, prefixed with `**/*`
const NEGATION_PATTERNS = ["**/*", `!node_modules/${MODULE_NAME}/lib/negated.js`]

type Hook = ((file: string) => boolean | void | Promise<boolean | void>) | null

async function createModule(tmpDir: { getTempDir(): Promise<string> }) {
  const projectDir = await tmpDir.getTempDir()
  const moduleDir = path.join(projectDir, "node_modules", MODULE_NAME)
  for (const file of ["package.json", "index.js", "index.d.ts", "README.md", "lib/util.js", "lib/util.d.ts", "lib/README.md", "lib/negated.js"]) {
    await fsExtra.outputFile(path.join(moduleDir, file), file)
  }
  return { projectDir, moduleDir }
}

async function collect(projectDir: string, moduleDir: string, hook: Hook, patterns: Array<string> | null, onFilter?: (file: string) => void) {
  const packager = {
    appInfo: { type: undefined },
    config: { onNodeModuleFile: hook },
    getWorkspaceRoot: () => Promise.resolve(projectDir),
  } as unknown as PlatformPackager<any>
  const destination = path.join("node_modules", MODULE_NAME)
  const matcher = new FileMatcher(moduleDir, path.join(projectDir, "out", destination), s => s, patterns)
  if (onFilter != null) {
    const createFilter = matcher.createFilter.bind(matcher)
    vi.spyOn(matcher, "createFilter").mockImplementation((): Filter => {
      const filter = createFilter()
      return (file, stat) => {
        onFilter(file)
        return filter(file, stat)
      }
    })
  }
  const helper = new NodeModuleCopyHelper(matcher, packager)
  const moduleInfo: NodeModuleInfo = { name: MODULE_NAME, version: "1.0.0", dir: moduleDir }
  const files = await helper.collectNodeModules(moduleInfo, EXCLUDED_EXTS, destination)
  return files.map(it => path.relative(moduleDir, it).replace(/\\/g, "/")).sort()
}

describe("NodeModuleCopyHelper.collectNodeModules", () => {
  test("applies default exclusions when no hook is configured", async ({ expect, tmpDir }) => {
    const { projectDir, moduleDir } = await createModule(tmpDir)
    expect(await collect(projectDir, moduleDir, null, null)).toEqual(["index.js", "lib/README.md", "lib/negated.js", "lib/util.js", "package.json"])
  })

  test("still applies the `files` negations when a filter is configured", async ({ expect, tmpDir }) => {
    const { projectDir, moduleDir } = await createModule(tmpDir)
    expect(await collect(projectDir, moduleDir, null, NEGATION_PATTERNS)).toEqual(["index.js", "lib/README.md", "lib/util.js", "package.json"])
  })

  test("an async hook resolving to false does not force-include default-excluded files", async ({ expect, tmpDir }) => {
    const { projectDir, moduleDir } = await createModule(tmpDir)
    // the old `!!onNodeModuleFile(filePath)` treated the pending Promise as truthy and kept every *.d.ts and README.md
    const hook: Hook = () => Promise.resolve(false)
    expect(await collect(projectDir, moduleDir, hook, NEGATION_PATTERNS)).toEqual(["index.js", "lib/README.md", "lib/util.js", "package.json"])
  })

  test("an async hook resolving to true force-includes the file", async ({ expect, tmpDir }) => {
    const { projectDir, moduleDir } = await createModule(tmpDir)
    const hook: Hook = file => Promise.resolve(file.endsWith(".d.ts"))
    expect(await collect(projectDir, moduleDir, hook, NEGATION_PATTERNS)).toEqual(["index.d.ts", "index.js", "lib/README.md", "lib/util.d.ts", "lib/util.js", "package.json"])
  })

  test("evaluates the directory filter at most once per directory, and only when a child is force-included", async ({ expect, tmpDir }) => {
    const { projectDir, moduleDir } = await createModule(tmpDir)
    // the directory check is `filter(dirPath, await lstat(dirPath))`, so a filter call with the directory path itself
    // corresponds 1:1 to a stat of that directory. The module root is never a child of an iterated directory.
    let rootDirChecks = 0
    const onFilter = (file: string) => {
      if (file === moduleDir) {
        rootDirChecks++
      }
    }

    // no hook: the directory filter is never needed
    await collect(projectDir, moduleDir, null, NEGATION_PATTERNS, onFilter)
    expect(rootDirChecks).toBe(0)

    // hook force-includes every child: one check for the whole directory instead of one per child
    rootDirChecks = 0
    await collect(projectDir, moduleDir, () => true, NEGATION_PATTERNS, onFilter)
    expect(rootDirChecks).toBe(1)
  })
})
