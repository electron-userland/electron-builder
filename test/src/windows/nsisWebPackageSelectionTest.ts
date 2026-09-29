import type { ToolsetConfig } from "app-builder-lib/internal"
import { getMakeNsisPath, getNsisPluginsPath } from "app-builder-lib/src/toolsets/nsis"
import { exec, spawnAndWriteWithOutput } from "builder-util"
import { createHash } from "crypto"
import * as fs from "fs/promises"
import { createServer } from "http"
import * as path from "path"

const templates = path.resolve(__dirname, "../../../packages/app-builder-lib/templates/nsis/include")
const fixture = path.resolve(__dirname, "../../fixtures/nsis-web-package-selection/installer.nsi")
const machines = ["32", "64", "ARM64"]
const cases = [
  { packages: ["ARM64"], expected: ["ARM64", "ARM64", "ARM64"] },
  { packages: ["64"], expected: ["64", "64", "64"] },
  { packages: ["32"], expected: ["32", "32", "32"] },
  { packages: ["64", "ARM64"], expected: ["64", "64", "ARM64"] },
  { packages: ["32", "ARM64"], expected: ["32", "32", "ARM64"] },
  { packages: ["32", "64"], expected: ["32", "64", "64"] },
  { packages: ["32", "64", "ARM64"], expected: ["32", "64", "ARM64"] },
]
const payload = (arch: string) => `package for ${arch}`
const hash = (arch: string) => createHash("sha512").update(payload(arch)).digest("hex").toUpperCase()

async function compile(dir: string, packages: string[], defines: string[], args = ["-WX", "-V2"], nsis?: ToolsetConfig["nsis"]): Promise<{ installer: string; stdout: string }> {
  const installer = path.join(dir, "installer.exe")
  const makensis = await getMakeNsisPath(nsis, dir)
  const plugins = await getNsisPluginsPath(nsis, dir)
  const script = [
    `!addincludedir "${templates}"`,
    `!addplugindir /x86-unicode "${path.join(plugins, "x86-unicode")}"`,
    ...defines,
    `!define UNINSTALLER_OUT_FILE "${fixture}"`,
    ...packages.flatMap(arch => [`!define APP_${arch}_NAME "app-${arch}.7z"`, `!define APP_${arch}_HASH "${hash(arch)}"`]),
    `OutFile "${installer}"`,
    await fs.readFile(fixture, "utf8"),
  ].join("\n")
  // With -WX (the default), undefined package constants must fail compilation, even if the bad branch isn't taken.
  const { stdout } = await spawnAndWriteWithOutput(makensis.path, [...args, "-"], script, { env: { ...process.env, ...makensis.env } })
  return { installer, stdout }
}

// The statements of the preprocessed script, in order.
function statements(script: string): string[] {
  return script
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== "" && !line.startsWith("!verbose"))
}

// Package verification branches (explicit --package-file, versioned download) must compile warning-free in every configuration,
// and are checked on every OS in the preprocessed script: the explicit package check unless unverified packages are allowed, the
// download check only for a versioned URL. A local package (explicit or adjacent) is always copied first, and only that copy is
// hashed and extracted. All of this happens before the installed version is uninstalled.
for (const incomplete of [false, true]) {
  for (const allowUnverified of [false, true]) {
    test(`NSIS web package verification compiles: ${incomplete ? "versioned" : "complete"} URL${allowUnverified ? ", unverified allowed" : ""}`, async ({ expect, tmpDir }) => {
      const dir = await tmpDir.createTempDir()
      const packages = ["32", "64", "ARM64"]
      const defines = [
        `!define APP_PACKAGE_URL "http://127.0.0.1/app.7z"`,
        ...(incomplete ? ["!define APP_PACKAGE_URL_IS_INCOMPLETE"] : []),
        ...(allowUnverified ? ["!define ALLOW_UNVERIFIED_APP_PACKAGE"] : []),
      ]
      // INSTALL_APPLICATION_FILES_ONLY: a script that inserts only installApplicationFiles (see below) compiles warning-free as well.
      const installOnlyDefines = [...defines, "!define INSTALL_APPLICATION_FILES_ONLY"]
      for (const scriptDefines of [defines, installOnlyDefines]) {
        await compile(dir, packages, scriptDefines)
        await compile(dir, packages, scriptDefines, undefined, "0.0.0")
      }
      const { stdout } = await compile(dir, packages, defines, ["-PPO"])
      expect(stdout.includes("doesn't match any package of this installer")).toBe(!allowUnverified)
      expect(stdout.includes("doesn't match this installer")).toBe(incomplete && !allowUnverified)

      const script = statements(stdout)
      const lookup = script.findIndex(line => line.startsWith("IfFileExists `$packageFile`"))
      // Messages name the local package (adjacent, explicit), not the installer's copy of it.
      expect(script.slice(0, lookup).filter(line => line.startsWith("StrCpy $4 "))).toEqual(['StrCpy $4 "$packageFile"', 'StrCpy $4 "$packageFile"'])

      // A local package is copied before anything else is done with it, a failed copy aborts the installation.
      const staged = 'StrCpy $packageFile "$PLUGINSDIR\\package-staged.7z"'
      const copied = /^IntCmp `\$0` `0` `` `(\w+)` `\1`$/.exec(script[lookup + 4])?.[1]
      expect(script.slice(lookup + 1, script.indexOf(staged) + 1)).toEqual([
        'Push "$PLUGINSDIR\\package-staged.7z"',
        'Push "$packageFile"',
        "System::Call 'kernel32::CopyFileW(w s, w s, i 1) i .r0'",
        `IntCmp \`$0\` \`0\` \`\` \`${copied}\` \`${copied}\``,
        'MessageBox MB_OK|MB_ICONSTOP "Package file $4 cannot be copied to $PLUGINSDIR. Installation aborted." /SD IDOK',
        "SetErrorLevel 2",
        "Quit",
        `${copied}:`,
        staged,
      ])

      // Then the package file is hashed, removed, reassigned, extracted and moved in this order, a package that matches is extracted.
      const hashPackageFile = ["push `$packageFile`", "StdUtils::HashFile /NOUNLOAD"]
      const uninstall = 'Delete "$EXEDIR\\installed.txt"'
      expect(
        script.slice(script.indexOf(staged) + 1).filter(line => /\$packageFile|package-staged\.7z|CopyFileW|StdUtils::HashFile|web_package_ready|installed\.txt/.test(line))
      ).toEqual([
        // explicit package
        ...(allowUnverified ? [] : [...hashPackageFile, ...["64", "32", "ARM64"].map(arch => `StrCmp $3 "${hash(arch)}" web_package_ready`)]),
        "Goto web_package_ready",
        // adjacent package, its copy is removed if it doesn't match
        ...hashPackageFile,
        "Goto web_package_ready",
        'Delete "$packageFile"',
        // download
        'StrCpy $packageFile "$PLUGINSDIR\\package.7z"',
        ...(incomplete && !allowUnverified ? hashPackageFile : []),
        "web_package_ready:",
        // the fixture's stand-in for uninstallOldVersion, then extractUsing7za and moveFile of the fixture
        uninstall,
        'FileWrite $R0 "$packageFile',
        'Rename "$packageFile" "$EXEDIR\\stored.7z"',
      ])

      // Every check, message, abort and download comes before the installed version is uninstalled. Only the extraction and the
      // storing of the package follow (the fixture's moveFile ends the installer).
      const uninstalled = script.indexOf(uninstall)
      const checkOrExit = /^(quit|seterrorlevel|messagebox|inetc::get|stdutils::hashfile|system::call)\b/i
      expect(script.slice(0, uninstalled).filter(line => line.startsWith("inetc::get "))).toHaveLength(2)
      expect(script.slice(uninstalled + 1).filter(line => checkOrExit.test(line))).toEqual(["SetErrorLevel 0", "Quit"])

      // A script that inserts only installApplicationFiles (e.g. a custom script based on an older installSection.nsh) gets the same
      // preparation, followed directly by the extraction.
      const { stdout: installOnly } = await compile(dir, packages, installOnlyDefines, ["-PPO"])
      expect(statements(installOnly)).toEqual(script.filter(line => line !== uninstall))
    })
  }
}

// installSection.nsh prepares the web package before it uninstalls the installed version; installApplicationFiles only extracts it.
test("installSection.nsh prepares the web package before uninstalling the installed version", async ({ expect }) => {
  const order = [
    "!insertmacro prepareWebPackage",
    "!insertmacro uninstallOldVersion SHELL_CONTEXT",
    "!insertmacro uninstallOldVersion HKEY_CURRENT_USER",
    "!insertmacro installApplicationFiles",
  ]
  const section = statements(await fs.readFile(path.join(templates, "..", "installSection.nsh"), "utf8")).filter(line => !line.startsWith("#") && !line.startsWith(";"))
  expect(section.filter(line => order.includes(line))).toEqual(order)

  // prepareWebPackage is the statement right before the uninstall and outside any conditional, so every installer run that uninstalls
  // the installed version has prepared the package first.
  const uninstall = section.indexOf(order[1])
  expect(section[uninstall - 1]).toBe(order[0])
  let depth = 0
  for (const line of section.slice(0, uninstall - 1)) {
    if (/^(!if|\$\{(if|ifnot|unless)\})/i.test(line)) {
      depth++
    } else if (/^(!endif|\$\{endif\})/i.test(line)) {
      depth--
    }
  }
  expect(depth).toBe(0)
})

// Installers with an embedded package, and with APP_BUILD_DIR, are unchanged: the web package preparation is empty for them.
test("NSIS web package preparation is empty for an embedded package and with APP_BUILD_DIR", async ({ expect, tmpDir }) => {
  const dir = await tmpDir.createTempDir()
  const makensis = await getMakeNsisPath(undefined, dir)
  for (const defines of [[], [`!define APP_BUILD_DIR "unused"`, `!define APP_PACKAGE_URL "http://127.0.0.1/app.7z"`]]) {
    const script = [
      `!addincludedir "${templates}"`,
      ...defines,
      "!include installer.nsh",
      "Section",
      'DetailPrint "before"',
      "!insertmacro prepareWebPackage",
      'DetailPrint "after"',
      "SectionEnd",
    ]
    const { stdout } = await spawnAndWriteWithOutput(makensis.path, ["-PPO", "-"], script.join("\n"), { env: { ...process.env, ...makensis.env } })
    const lines = statements(stdout)
    expect(lines.slice(lines.indexOf('DetailPrint "before"'), lines.indexOf('DetailPrint "after"') + 1)).toEqual(['DetailPrint "before"', 'DetailPrint "after"'])
  }
})

for (const { packages, expected, completeUrl, allowUnverified, nsis } of [
  ...cases.map(value => ({ ...value, completeUrl: false, allowUnverified: false, nsis: undefined })),
  { ...cases[0], completeUrl: true, allowUnverified: false, nsis: undefined },
  { ...cases[cases.length - 1], completeUrl: false, allowUnverified: true, nsis: undefined },
  // the legacy NSIS toolset (its StdUtils, inetc and System plugins) at run time
  { ...cases[1], completeUrl: false, allowUnverified: false, nsis: "0.0.0" as const },
]) {
  const suffix = `${completeUrl ? " (complete URL)" : ""}${allowUnverified ? " (unverified allowed)" : ""}${nsis == null ? "" : ` (NSIS ${nsis})`}`
  test.ifWindows(`NSIS web package selection: ${packages.join(" + ")}${suffix}`, async ({ expect, tmpDir }) => {
    const dir = await tmpDir.createTempDir()
    const requests: string[] = []
    let mismatched = false
    const server = createServer((req, res) => {
      requests.push(req.url!)
      const arch = /app-(32|64|ARM64)\.7z$/.exec(req.url!)?.[1]
      res.writeHead(arch != null && packages.includes(arch) ? 200 : 404)
      res.end(arch == null ? "invalid package" : mismatched ? "different package" : payload(arch))
    })
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      if (address == null || typeof address === "string") {
        throw new Error("Expected a TCP server address")
      }
      const url = `http://127.0.0.1:${address.port}`
      const { installer } = await compile(
        dir,
        packages,
        [
          `!define APP_PACKAGE_URL "${completeUrl ? `${url}/app-ARM64.7z` : url}"`,
          ...(completeUrl ? [] : ["!define APP_PACKAGE_URL_IS_INCOMPLETE"]),
          ...(allowUnverified ? ["!define ALLOW_UNVERIFIED_APP_PACKAGE"] : []),
        ],
        undefined,
        nsis
      )
      // The installed version, which the fixture removes where installSection.nsh uninstalls it: after the package is prepared.
      const installed = path.join(dir, "installed.txt")
      // replaced: a local package the fixture writes other content to while the installer runs; the installer keeps using its own copy.
      const run = async (arch: string, packageFile?: string, replaced?: string) => {
        requests.length = 0
        await fs.rm(path.join(dir, "result.txt"), { force: true })
        await fs.rm(path.join(dir, "stored.7z"), { force: true })
        await fs.writeFile(installed, "installed version")
        const args = [
          "/S",
          `--arch=${arch}`,
          ...(packageFile == null ? [] : [`--package-file=${packageFile}`]),
          ...(replaced == null ? [] : [`--replace-local-package=${replaced}`]),
        ]
        await exec(installer, args)
        await expect(fs.access(installed)).rejects.toThrow()
        return (await fs.readFile(path.join(dir, "result.txt"), "utf8")).split("\n")
      }
      // A refused package aborts the installation before the installed version is uninstalled.
      const expectRefused = async (result: Promise<unknown>) => {
        await expect(result).rejects.toMatchObject({ exitCode: 2 })
        expect(await fs.readFile(installed, "utf8")).toBe("installed version")
      }
      // The package that is extracted and then stored for differential updates: a download, or the installer's copy of a local package.
      const downloadedPackage = /\\ns\w+\.tmp\\package\.7z$/
      const stagedPackage = /\\ns\w+\.tmp\\package-staged\.7z$/
      const storedPackage = () => fs.readFile(path.join(dir, "stored.7z"), "utf8")
      for (const [index, machine] of machines.entries()) {
        const arch = expected[index]
        const name = `app-${arch}.7z`
        const adjacent = path.join(dir, name)
        const downloaded = await run(machine)
        expect(requests).toEqual([`/${name}`])
        expect(downloaded[0]).toMatch(downloadedPackage)
        expect(downloaded[1]).toBe(hash(arch))
        expect(downloaded[2]).toBe(`${url}/${name}`)

        // The adjacent package is left in place, the installer uses its own copy.
        await fs.writeFile(adjacent, payload(arch))
        const local = await run(machine)
        expect(requests).toEqual([])
        expect(local[0]).toMatch(stagedPackage)
        expect(local[1]).toBe(hash(arch))
        expect(await storedPackage()).toBe(payload(arch))
        expect(await fs.readFile(adjacent, "utf8")).toBe(payload(arch))
        await run(machine, undefined, adjacent)
        expect(requests).toEqual([])
        expect(await storedPackage()).toBe(payload(arch))
        expect(await fs.readFile(adjacent, "utf8")).toBe("replaced package")

        await fs.writeFile(adjacent, "wrong checksum")
        const fallback = await run(machine)
        expect(requests).toEqual([`/${name}`])
        expect(fallback[0]).toMatch(downloadedPackage)
        expect(await storedPackage()).toBe(payload(arch))
        await fs.rm(adjacent)
      }
      // Explicit packages skip filename selection: a package of any arch built with this installer is accepted.
      // The explicit package is left in place, the installer uses its own copy.
      const explicit = path.join(dir, "explicit.7z")
      for (const arch of packages) {
        await fs.writeFile(explicit, payload(arch))
        const local = await run("ARM64", explicit)
        expect(requests).toEqual([])
        expect(local[0]).toMatch(stagedPackage)
        expect(await storedPackage()).toBe(payload(arch))
        expect(await fs.readFile(explicit, "utf8")).toBe(payload(arch))
        await run("ARM64", explicit, explicit)
        expect(requests).toEqual([])
        expect(await storedPackage()).toBe(payload(arch))
        expect(await fs.readFile(explicit, "utf8")).toBe("replaced package")
      }
      // A foreign explicit package aborts the installation without a fallback download, unless unverified packages are allowed.
      await fs.writeFile(explicit, "user supplied package")
      if (allowUnverified) {
        const local = await run("ARM64", explicit)
        expect(local[0]).toMatch(stagedPackage)
        expect(await storedPackage()).toBe("user supplied package")
      } else {
        await expectRefused(run("ARM64", explicit))
      }
      expect(requests).toEqual([])

      // An explicit package that cannot be copied (a directory) aborts the installation, even if unverified packages are allowed.
      await fs.rm(explicit)
      await fs.mkdir(explicit)
      await expectRefused(run("ARM64", explicit))
      expect(requests).toEqual([])

      // A missing explicit file must still select the correct download independently.
      await fs.rmdir(explicit)
      await run("ARM64", explicit)
      expect(requests).toEqual([`/app-${expected[2]}.7z`])

      // A versioned download must match the selected package; a complete URL (explicit appPackageUrl) isn't verified.
      mismatched = true
      if (completeUrl || allowUnverified) {
        const downloaded = await run("ARM64")
        expect(downloaded[2]).toBe(`${url}/app-${expected[2]}.7z`)
      } else {
        await expectRefused(run("ARM64"))
      }
      expect(requests).toEqual([`/app-${expected[2]}.7z`])
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
    }
  })
}
