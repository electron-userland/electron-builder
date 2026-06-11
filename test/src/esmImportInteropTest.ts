import { execFileSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { describe, expect, it } from "vitest"

// Guards against the CJS/ESM interop hazard fixed in #9880/#9883 (sax, plist, chromium-pickle-js,
// which, mime, ...). When electron-builder's ESM output does `import * as x from "<cjs-pkg>"`, Node's
// loader only exposes the named bindings that cjs-module-lexer can statically detect on the namespace;
// everything else lives solely on the default export. So `x.member` silently becomes `undefined` at
// runtime even though `pnpm compile` stays green (the package's .d.ts lies about being ESM).
//
// This test replicates Node's real ESM resolution (per workspace package, honoring the "import"
// condition — which is why dual-build packages like `tar`/`yargs` correctly pass) and fails only when
// an accessed member is present on the CJS default export but missing from the namespace. Type-only
// members are absent on both, so they are never flagged.

const WORKSPACE_ROOT = path.resolve(__dirname, "../../")
const PACKAGES_DIR = path.join(WORKSPACE_ROOT, "packages")

const NODE_BUILTINS = new Set(
  "assert async_hooks buffer child_process constants crypto dns events fs http https module net os path perf_hooks process querystring readline stream string_decoder timers tls tty url util v8 vm worker_threads zlib".split(
    " "
  )
)
const isExternal = (specifier: string) => !specifier.startsWith(".") && !specifier.startsWith("node:") && !NODE_BUILTINS.has(specifier.split("/")[0])

interface NamespaceImport {
  pkg: string
  members: string[]
  calledDirectly: boolean
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full))
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full)
    }
  }
  return out
}

// Collect every `import * as alias from "<external>"` grouped by the workspace package it lives in.
function collectNamespaceImports(): Map<string, NamespaceImport[]> {
  const byPackage = new Map<string, NamespaceImport[]>()
  for (const pkgName of fs.readdirSync(PACKAGES_DIR)) {
    const srcDir = path.join(PACKAGES_DIR, pkgName, "src")
    if (!fs.existsSync(srcDir)) {
      continue
    }
    const imports: NamespaceImport[] = []
    for (const file of listSourceFiles(srcDir)) {
      const src = fs.readFileSync(file, "utf8")
      for (const m of src.matchAll(/^import \* as ([A-Za-z0-9_]+) from "([^"]+)"/gm)) {
        const [, alias, pkg] = m
        if (!isExternal(pkg)) {
          continue
        }
        const members = [...new Set([...src.matchAll(new RegExp(`\\b${alias}\\.([A-Za-z0-9_]+)`, "g"))].map(x => x[1]))]
        const calledDirectly = new RegExp(`(?:new\\s+)?\\b${alias}\\s*\\(`).test(src.replace(new RegExp(`import \\* as ${alias}\\b`, "g"), ""))
        imports.push({ pkg, members, calledDirectly })
      }
    }
    if (imports.length) {
      byPackage.set(pkgName, imports)
    }
  }
  return byPackage
}

// Runs inside the target package directory so `import(pkg)` resolves via Node's ESM algorithm and the
// "import" condition — exactly how electron-builder's built output loads its dependencies.
const PROBE_SOURCE = `
import { readFileSync } from "node:fs"
const tasks = JSON.parse(readFileSync(process.env.PROBE_TASKS, "utf8"))
const broken = []
for (const t of tasks) {
  let ns
  try { ns = await import(t.pkg) } catch { continue } // unresolved/types-only subpaths can't break at runtime
  const def = ns.default
  for (const member of t.members) {
    if (ns[member] === undefined && def != null && def[member] !== undefined) {
      broken.push(t.pkg + "." + member)
    }
  }
  if (t.calledDirectly && typeof def === "function" && typeof ns !== "function") {
    broken.push(t.pkg + "()")
  }
}
process.stdout.write(JSON.stringify(broken))
`

function probePackage(pkgName: string, imports: NamespaceImport[]): string[] {
  const pkgDir = path.join(PACKAGES_DIR, pkgName)
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const probeFile = path.join(pkgDir, `__esm_interop_probe__${suffix}.mjs`)
  const tasksFile = path.join(pkgDir, `__esm_interop_tasks__${suffix}.json`)
  try {
    fs.writeFileSync(probeFile, PROBE_SOURCE)
    fs.writeFileSync(tasksFile, JSON.stringify(imports))
    const out = execFileSync(process.execPath, [probeFile], {
      env: { ...process.env, PROBE_TASKS: tasksFile },
      encoding: "utf8",
    })
    return JSON.parse(out || "[]")
  } finally {
    fs.rmSync(probeFile, { force: true })
    fs.rmSync(tasksFile, { force: true })
  }
}

describe("ESM/CJS namespace-import interop", () => {
  it("every `import * as` of an external package exposes the members it uses at runtime", () => {
    const byPackage = collectNamespaceImports()
    const broken: string[] = []
    for (const [pkgName, imports] of byPackage) {
      broken.push(...probePackage(pkgName, imports))
    }
    // A non-empty list means a namespace import accesses a member that only exists on the CJS default
    // export — switch that import to `import x from "<pkg>"` (default import). See #9883.
    expect(broken).toEqual([])
  }, 60_000)
})
