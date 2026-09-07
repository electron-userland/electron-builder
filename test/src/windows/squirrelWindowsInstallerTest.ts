import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// createWindowsInstaller shells out to nuget.exe / SyncReleases.exe / Squirrel.exe (under mono off-Windows).
// Intercept `exec` so the argument construction can be asserted on every OS without the vendor binaries.
vi.mock("builder-util", async () => {
  const actual = await vi.importActual<typeof import("builder-util")>("builder-util")
  return { ...actual, exec: vi.fn().mockResolvedValue("") }
})

import { exec } from "builder-util"
import {
  buildAdditionalFilesXml,
  convertVersion,
  createWindowsInstaller,
  escapeXml,
  InstallerOptions,
  renderNuspecTemplate,
} from "electron-builder-squirrel-windows/src/windowsInstaller"
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import * as path from "path"

describe("convertVersion", () => {
  test.each([
    ["1.0.0", "1.0.0"],
    ["1.2.3", "1.2.3"],
    ["1.0.0-alpha", "1.0.0-alpha"],
    ["1.0.0-alpha.1", "1.0.0-alpha1"],
    ["1.0.0-alpha.beta", "1.0.0-alphabeta"],
    ["1.0.0-rc.1", "1.0.0-rc1"],
    ["2.0.0-beta.2", "2.0.0-beta2"],
    ["1.0.0+build.123", "1.0.0"],
    ["1.0.0-beta+build.1", "1.0.0-beta"],
    ["2.0.0-rc.1+sha.abc123", "2.0.0-rc1"],
    ["10.20.30", "10.20.30"],
  ])("converts %s → %s", (input, expected) => {
    expect(convertVersion(input)).toBe(expected)
  })
})

describe("escapeXml", () => {
  test.each([
    ["Foo & Bar", "Foo &amp; Bar"],
    ["<script>alert(1)</script>", "&lt;script&gt;alert(1)&lt;/script&gt;"],
    ['"double quoted"', "&quot;double quoted&quot;"],
    ["it's fine", "it&apos;s fine"],
    ["normal text", "normal text"],
    ["a & b < c > d", "a &amp; b &lt; c &gt; d"],
    ["", ""],
  ])("escapes %s", (input, expected) => {
    expect(escapeXml(input)).toBe(expected)
  })

  test("escapes all five XML special characters", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;")
  })
})

describe("renderNuspecTemplate", () => {
  test("substitutes a single variable", () => {
    expect(renderNuspecTemplate("<id><%- name %></id>", { name: "MyApp" })).toBe("<id>MyApp</id>")
  })

  test("substitutes multiple variables", () => {
    const template = "<id><%- name %></id><version><%- version %></version>"
    expect(renderNuspecTemplate(template, { name: "App", version: "1.2.3" })).toBe("<id>App</id><version>1.2.3</version>")
  })

  test("leaves unknown placeholders untouched", () => {
    expect(renderNuspecTemplate("<%- unknown %>", {})).toBe("<%- unknown %>")
  })

  test("handles empty string values", () => {
    expect(renderNuspecTemplate("<a><%- val %></a>", { val: "" })).toBe("<a></a>")
  })

  test("substitutes the same key multiple times", () => {
    const template = "<%- x %> and <%- x %>"
    expect(renderNuspecTemplate(template, { x: "hello" })).toBe("hello and hello")
  })

  test("inserts pre-escaped XML values verbatim", () => {
    const template = "<desc><%- description %></desc>"
    const result = renderNuspecTemplate(template, { description: "A &amp; B" })
    expect(result).toBe("<desc>A &amp; B</desc>")
  })

  test("inserts additionalFilesXml block without double-escaping", () => {
    const extra = `    <file src="swiftshader\\**" target="lib\\net45\\swiftshader" />`
    const template = "<%- additionalFilesXml %>"
    expect(renderNuspecTemplate(template, { additionalFilesXml: extra })).toBe(extra)
  })
})

describe("buildAdditionalFilesXml", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-installer-test-"))
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  test("returns empty string when no optional GPU files present", async () => {
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toBe("")
  })

  test("includes swiftshader entry when directory present", async () => {
    await mkdir(path.join(tmpDir, "swiftshader"), { recursive: true })
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toContain("swiftshader")
    expect(result).toContain("<file")
  })

  test("includes vk_swiftshader_icd.json entry when file present", async () => {
    await writeFile(path.join(tmpDir, "vk_swiftshader_icd.json"), "{}")
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toContain("vk_swiftshader_icd.json")
    expect(result).toContain("<file")
  })

  test("includes both entries when both present", async () => {
    await mkdir(path.join(tmpDir, "swiftshader"), { recursive: true })
    await writeFile(path.join(tmpDir, "vk_swiftshader_icd.json"), "{}")
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toContain("swiftshader")
    expect(result).toContain("vk_swiftshader_icd.json")
    const lines = result.split("\n").filter((l: string) => l.trim())
    expect(lines).toHaveLength(2)
  })

  test("does not include unrelated files", async () => {
    await writeFile(path.join(tmpDir, "some-other-file.dll"), "")
    const result = await buildAdditionalFilesXml(tmpDir)
    expect(result).toBe("")
  })
})

describe("createWindowsInstaller", () => {
  let tmpDir: string
  let vendorDir: string
  let appDir: string
  let outDir: string
  let nugetOutputDirs: Array<string>
  const templatePath = path.join(__dirname, "..", "..", "..", "packages", "electron-builder-squirrel-windows", "template.nuspectemplate")
  const useMono = process.platform !== "win32"

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "eb-create-installer-test-"))
    vendorDir = path.join(tmpDir, "vendor")
    appDir = path.join(tmpDir, "app")
    outDir = path.join(tmpDir, "out")
    nugetOutputDirs = []
    await Promise.all([mkdir(vendorDir), mkdir(appDir), mkdir(outDir)])
    await Promise.all(["Squirrel.exe", "Squirrel-Mono.exe", "nuget.exe", "SyncReleases.exe"].map(name => writeFile(path.join(vendorDir, name), name)))
    vi.mocked(exec).mockClear()
  })

  afterEach(() => rm(tmpDir, { recursive: true, force: true }).catch(() => {}))

  function baseOptions(overrides: Partial<InstallerOptions> = {}): InstallerOptions {
    return {
      appDirectory: appDir,
      outputDirectory: outDir,
      vendorDirectory: vendorDir,
      name: "TestApp",
      title: "Test App",
      version: "1.1.0",
      description: "Test Application",
      exe: "Test App.exe",
      authors: "Foo Bar",
      iconUrl: "https://example.com/icon.ico",
      copyright: "Copyright © 2026 Foo Bar",
      nuspecTemplate: templatePath,
      loadingGif: path.join(tmpDir, "spinner.gif"),
      setupExe: "Test App Setup 1.1.0.exe",
      fixUpPaths: true,
      createTempDir: async ({ prefix }) => {
        const dir = await mkdtemp(path.join(tmpDir, prefix))
        nugetOutputDirs.push(dir)
        return dir
      },
      ...overrides,
    }
  }

  // Squirrel's releasify writes Setup.exe (and Setup.msi when MSI output is enabled) into the release dir.
  async function fakeReleasifyOutput(files: Array<string>) {
    await Promise.all(files.map(name => writeFile(path.join(outDir, name), name)))
  }

  interface Invocation {
    readonly exe: string
    readonly args: Array<string>
  }

  // Normalize the recorded exec calls: off-Windows every vendor exe runs as `mono <exe> ...args`.
  function invocations(): Array<Invocation> {
    return vi.mocked(exec).mock.calls.map(call => {
      const [file, args] = call as unknown as [string, Array<string>]
      if (useMono) {
        expect(file).toBe("mono")
        return { exe: args[0], args: args.slice(1) }
      }
      return { exe: file, args }
    })
  }

  function findInvocation(exeName: string): Invocation | undefined {
    return invocations().find(it => path.basename(it.exe) === exeName)
  }

  function releasifyInvocation(): Invocation {
    const it = findInvocation(useMono ? "Squirrel-Mono.exe" : "Squirrel.exe")
    expect(it).toBeDefined()
    return it!
  }

  async function readNuspec(name: string) {
    expect(nugetOutputDirs).toHaveLength(1)
    return readFile(path.join(nugetOutputDirs[0], `${name}.nuspec`), "utf8")
  }

  test("packs with nuget, releasifies without MSI and renames Setup.exe to the artifact name", async () => {
    await fakeReleasifyOutput(["Setup.exe"])
    const options = baseOptions()
    await createWindowsInstaller(options)

    // Squirrel.exe must be next to the app so the nuspec can pick it up
    expect(await readFile(path.join(appDir, "Squirrel.exe"), "utf8")).toBe("Squirrel.exe")

    const calls = invocations()
    expect(calls).toHaveLength(2)
    expect(calls.map(it => path.basename(it.exe))).toEqual(["nuget.exe", useMono ? "Squirrel-Mono.exe" : "Squirrel.exe"])
    // exact host prefix (not just normalized away): the vendor exes are Win32 binaries
    const rawCalls = vi.mocked(exec).mock.calls
    if (useMono) {
      expect(rawCalls[0][0]).toBe("mono")
      expect((rawCalls[0][1] as Array<string>)[0]).toBe(path.join(vendorDir, "nuget.exe"))
      expect(rawCalls[1][0]).toBe("mono")
      expect((rawCalls[1][1] as Array<string>)[0]).toBe(path.join(vendorDir, "Squirrel-Mono.exe"))
    } else {
      expect(rawCalls[0][0]).toBe(path.join(vendorDir, "nuget.exe"))
      expect(rawCalls[1][0]).toBe(path.join(vendorDir, "Squirrel.exe"))
    }

    const nugetOutput = nugetOutputDirs[0]
    expect(calls[0].args).toEqual(["pack", path.join(nugetOutput, "TestApp.nuspec"), "-BasePath", appDir, "-OutputDirectory", nugetOutput, "-NoDefaultExcludes"])
    expect(calls[1].args).toEqual(["--releasify", path.join(nugetOutput, "TestApp.1.1.0.nupkg"), "--releaseDir", outDir, "--loadingGif", options.loadingGif, "--no-msi"])

    const outFiles = await readdir(outDir)
    expect(outFiles).toEqual(["Test App Setup 1.1.0.exe"])
  })

  test("msi: true drops --no-msi and renames Setup.msi to the msi artifact name", async () => {
    await fakeReleasifyOutput(["Setup.exe", "Setup.msi"])
    await createWindowsInstaller(baseOptions({ msi: true, setupMsi: "Test App Setup 1.1.0.msi" }))

    expect(releasifyInvocation().args).not.toContain("--no-msi")
    const outFiles = (await readdir(outDir)).sort()
    expect(outFiles).toEqual(["Test App Setup 1.1.0.exe", "Test App Setup 1.1.0.msi"])
  })

  test("msi: false keeps --no-msi", async () => {
    await fakeReleasifyOutput(["Setup.exe"])
    await createWindowsInstaller(baseOptions({ msi: false }))
    expect(releasifyInvocation().args).toContain("--no-msi")
  })

  test("throws when MSI output was requested but Squirrel did not produce Setup.msi", async () => {
    await fakeReleasifyOutput(["Setup.exe"])
    await expect(createWindowsInstaller(baseOptions({ msi: true, setupMsi: "Test App Setup 1.1.0.msi" }))).rejects.toThrow(
      `MSI output was requested but Squirrel.Windows did not produce ${path.join(outDir, "Setup.msi")}`
    )
    // Setup.exe was already renamed before the msi check
    expect(await readdir(outDir)).toEqual(["Test App Setup 1.1.0.exe"])
  })

  test("omits --loadingGif when no gif is configured", async () => {
    await fakeReleasifyOutput(["Setup.exe"])
    await createWindowsInstaller(baseOptions({ loadingGif: null }))
    const args = releasifyInvocation().args
    expect(args).not.toContain("--loadingGif")
    expect(args).toEqual(["--releasify", expect.stringMatching(/TestApp\.1\.1\.0\.nupkg$/), "--releaseDir", outDir, "--no-msi"])
  })

  test("fixUpPaths: false leaves Setup.exe untouched", async () => {
    await fakeReleasifyOutput(["Setup.exe"])
    await createWindowsInstaller(baseOptions({ fixUpPaths: false }))
    expect(await readdir(outDir)).toEqual(["Setup.exe"])
  })

  describe("remoteReleases", () => {
    test("runs SyncReleases with -u/-r and the token before releasify", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await createWindowsInstaller(baseOptions({ remoteReleases: "https://github.com/some-user/some-project", remoteToken: "secret-token" }))

      const calls = invocations()
      expect(calls.map(it => path.basename(it.exe))).toEqual(["nuget.exe", "SyncReleases.exe", useMono ? "Squirrel-Mono.exe" : "Squirrel.exe"])
      expect(calls[1].exe).toBe(path.join(vendorDir, "SyncReleases.exe"))
      expect(calls[1].args).toEqual(["-u", "https://github.com/some-user/some-project", "-r", outDir, "-t", "secret-token"])
    })

    test("omits -t when no token is set", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await createWindowsInstaller(baseOptions({ remoteReleases: "https://github.com/some-user/some-project" }))
      expect(findInvocation("SyncReleases.exe")!.args).toEqual(["-u", "https://github.com/some-user/some-project", "-r", outDir])
    })

    test("does not run SyncReleases when remoteReleases is unset, even with a token", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await createWindowsInstaller(baseOptions({ remoteToken: "secret-token" }))
      expect(findInvocation("SyncReleases.exe")).toBeUndefined()
      expect(invocations()).toHaveLength(2)
    })
  })

  describe("nuspec", () => {
    const sep = path.sep === "/" ? "/" : "\\"

    test("renders the metadata fields (escaped) and the exe file entry", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await createWindowsInstaller(
        baseOptions({
          name: "My & App",
          title: "My <Title>",
          version: "1.0.0-beta.1",
          description: 'Say "hi"',
          exe: "My App.exe",
          authors: "Foo & Bar",
          iconUrl: "https://example.com/icon.ico?a=1&b=2",
          copyright: "Copyright © 2026 Foo & Bar",
        })
      )

      const nuspec = await readNuspec("My & App")
      expect(nuspec).toContain("<id>My &amp; App</id>")
      expect(nuspec).toContain("<title>My &lt;Title&gt;</title>")
      expect(nuspec).toContain("<version>1.0.0-beta1</version>")
      expect(nuspec).toContain("<authors>Foo &amp; Bar</authors>")
      // owners default to authors
      expect(nuspec).toContain("<owners>Foo &amp; Bar</owners>")
      expect(nuspec).toContain("<iconUrl>https://example.com/icon.ico?a=1&amp;b=2</iconUrl>")
      expect(nuspec).toContain("<description>Say &quot;hi&quot;</description>")
      expect(nuspec).toContain("<copyright>Copyright © 2026 Foo &amp; Bar</copyright>")
      expect(nuspec).toContain(`<file src="My App.exe" target="lib${sep}net45${sep}My App.exe" />`)
      // the stock template has no projectUrl — SquirrelWindowsTarget injects it into a temp template when known
      expect(nuspec).not.toContain("<projectUrl>")
      // the nuget pack invocation points at the rendered file
      expect(invocations()[0].args[1]).toBe(path.join(nugetOutputDirs[0], "My & App.nuspec"))
      expect(invocations()[1].args[1]).toBe(path.join(nugetOutputDirs[0], "My & App.1.0.0-beta1.nupkg"))
    })

    test("uses a custom template as-is (projectUrl passthrough)", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      const customTemplate = path.join(tmpDir, "custom.nuspectemplate")
      const stock = await readFile(templatePath, "utf8")
      await writeFile(
        customTemplate,
        stock.replace("<copyright><%- copyright %></copyright>", "<copyright><%- copyright %></copyright>\n    <projectUrl>http://foo.example.com</projectUrl>")
      )
      await createWindowsInstaller(baseOptions({ nuspecTemplate: customTemplate }))
      expect(await readNuspec("TestApp")).toContain("<copyright>Copyright © 2026 Foo Bar</copyright>\n    <projectUrl>http://foo.example.com</projectUrl>")
    })

    test("falls back for description, title, owners and copyright", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await createWindowsInstaller(baseOptions({ title: null, description: null, copyright: null, owners: null, iconUrl: null }))
      const nuspec = await readNuspec("TestApp")
      expect(nuspec).toContain("<title>TestApp</title>")
      expect(nuspec).toContain("<description>TestApp</description>")
      expect(nuspec).toContain("<owners>Foo Bar</owners>")
      expect(nuspec).toContain(`<copyright>Copyright © ${new Date().getFullYear()} Foo Bar</copyright>`)
      expect(nuspec).toContain("<iconUrl></iconUrl>")
    })

    test("explicit owners and description-less title fallback", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await createWindowsInstaller(baseOptions({ owners: "Owner Co", description: undefined }))
      const nuspec = await readNuspec("TestApp")
      expect(nuspec).toContain("<owners>Owner Co</owners>")
      expect(nuspec).toContain("<description>Test App</description>")
    })

    test("includes the optional GPU file entries when present in the app dir", async () => {
      await fakeReleasifyOutput(["Setup.exe"])
      await writeFile(path.join(appDir, "vk_swiftshader_icd.json"), "{}")
      await createWindowsInstaller(baseOptions())
      const nuspec = await readNuspec("TestApp")
      expect(nuspec).toContain(`<file src="vk_swiftshader_icd.json" target="lib${sep}net45" />`)
      expect(nuspec).not.toContain("swiftshader\\**")
      await access(path.join(appDir, "Squirrel.exe"))
    })
  })
})
