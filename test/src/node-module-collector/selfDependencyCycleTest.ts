import { afterEach, describe, test } from "vitest"
import * as fse from "fs-extra"
import * as path from "path"
import { NpmNodeModulesCollector } from "app-builder-lib/src/node-module-collector/npmNodeModulesCollector"
import type { NodeModuleInfo, NpmDependency } from "app-builder-lib/src/node-module-collector/types"
import { TmpDir } from "builder-util"

// A package that declares itself as a dependency (e.g. libsql@0.3.19, pulled in via
// @prisma/adapter-libsql -> @libsql/client) produces a self-edge in the production graph.
// The collector must terminate and collect the package once instead of recursing until
// heap exhaustion (issue #10068, previously #9147).

const projectTmpDir = new TmpDir("eb-self-dep-cycle-test")

async function buildPackageTree(packages: Record<string, object>): Promise<string> {
  const root = await projectTmpDir.createTempDir()
  for (const [rel, json] of Object.entries(packages)) {
    const abs = path.join(root, rel)
    await fse.ensureDir(path.dirname(abs))
    await fse.writeJson(abs, json)
  }
  return root
}

function countByName(nodeModules: NodeModuleInfo[]): Map<string, number> {
  const counts = new Map<string, number>()
  const visit = (nodes: NodeModuleInfo[]) => {
    for (const node of nodes) {
      counts.set(node.name, (counts.get(node.name) ?? 0) + 1)
      if (node.dependencies != null) {
        visit(node.dependencies)
      }
    }
  }
  visit(nodeModules)
  return counts
}

class StubbedNpmNodeModulesCollector extends NpmNodeModulesCollector {
  constructor(
    rootDir: string,
    tempDirManager: TmpDir,
    private readonly cannedTree: NpmDependency
  ) {
    super(rootDir, tempDirManager)
  }

  protected override getDependenciesTree(): Promise<NpmDependency> {
    return Promise.resolve(this.cannedTree)
  }
}

const runNpmCollector = (rootDir: string, tree: NpmDependency) =>
  new StubbedNpmNodeModulesCollector(rootDir, projectTmpDir as unknown as TmpDir, tree).getNodeModules({ packageName: "my-app" })

describe("npm collector dependency cycles (issue #10068)", { sequential: true }, () => {
  let root = ""
  afterEach(async () => {
    if (root) {
      await fse.rm(root, { recursive: true, force: true })
      root = ""
    }
  })

  test("terminates and collects a self-referencing package once", { timeout: 30_000 }, async ({ expect }) => {
    root = await buildPackageTree({
      "node_modules/libsql/package.json": { name: "libsql", version: "0.3.19" },
      "node_modules/detect-libc/package.json": { name: "detect-libc", version: "2.0.2" },
    })
    const libsqlPath = path.join(root, "node_modules", "libsql")
    // Shape of `npm list -a --json --long` for a self-referencing package: the nested self entry
    // is a deduped reference (has `_dependencies` but no `dependencies` of its own).
    const tree: NpmDependency = {
      name: "my-app",
      version: "1.0.0",
      path: root,
      _dependencies: { libsql: "^0.3.15" },
      dependencies: {
        libsql: {
          name: "libsql",
          version: "0.3.19",
          path: libsqlPath,
          _dependencies: { libsql: "^0.3.15", "detect-libc": "2.0.2" },
          dependencies: {
            libsql: { name: "libsql", version: "0.3.19", path: libsqlPath, _dependencies: { libsql: "^0.3.15", "detect-libc": "2.0.2" } },
            "detect-libc": { name: "detect-libc", version: "2.0.2", path: path.join(root, "node_modules", "detect-libc"), _dependencies: {} },
          },
        },
      },
    }

    const { nodeModules } = await runNpmCollector(root, tree)
    const counts = countByName(nodeModules)
    expect(counts.get("libsql")).toBe(1)
    expect(counts.get("detect-libc")).toBe(1)
  })

  test("terminates on a mutual dependency cycle (a -> b -> a)", { timeout: 30_000 }, async ({ expect }) => {
    root = await buildPackageTree({
      "node_modules/pkg-a/package.json": { name: "pkg-a", version: "1.0.0" },
      "node_modules/pkg-b/package.json": { name: "pkg-b", version: "1.0.0" },
    })
    const aPath = path.join(root, "node_modules", "pkg-a")
    const bPath = path.join(root, "node_modules", "pkg-b")
    const tree: NpmDependency = {
      name: "my-app",
      version: "1.0.0",
      path: root,
      _dependencies: { "pkg-a": "^1.0.0" },
      dependencies: {
        "pkg-a": {
          name: "pkg-a",
          version: "1.0.0",
          path: aPath,
          _dependencies: { "pkg-b": "^1.0.0" },
          dependencies: {
            "pkg-b": {
              name: "pkg-b",
              version: "1.0.0",
              path: bPath,
              _dependencies: { "pkg-a": "^1.0.0" },
              dependencies: {
                "pkg-a": { name: "pkg-a", version: "1.0.0", path: aPath, _dependencies: { "pkg-b": "^1.0.0" } },
              },
            },
          },
        },
      },
    }

    const { nodeModules } = await runNpmCollector(root, tree)
    const counts = countByName(nodeModules)
    expect(counts.get("pkg-a")).toBe(1)
    expect(counts.get("pkg-b")).toBe(1)
  })
})
