import { Arch, Configuration, WinPackager } from "app-builder-lib"
import { getEffectiveOptions } from "app-builder-lib/src/options/CommonWindowsInstallerConfiguration"
import MsiTarget from "app-builder-lib/src/targets/win/MsiTarget"
import { WixSchema } from "app-builder-lib/src/toolsets/wix"
import { createHash } from "crypto"
import { InvalidConfigurationError } from "builder-util"
import { XMLValidator } from "fast-xml-parser"
import { mkdir, readFile, writeFile } from "fs/promises"
import * as path from "path"
import { TmpDir } from "temp-file"
import { expect, vi } from "vitest"

// Renders the MSI target's .wxs project (MsiTarget.writeManifest) offline and on every OS, for both WiX bundles, without
// downloading a toolset or running candle/light: a real WinPackager over a minimal fake Packager, with the toolset and the
// icon stubbed. The e2e msi suites, which compile the project, run on Windows only.

const PRODUCT_NAME = "Test MSI"
// the per-user install directory is named after package.json `name`
const INSTALL_DIR_NAME = "TestApp"

interface ProjectOptions {
  readonly schema: WixSchema
  readonly msi?: Configuration["msi"]
  // relative paths (with "/") of the files in the app dir; defaults to the main executable and two subdirectories
  readonly files?: Array<string>
  // runs as the msiProjectCreated hook, with the project file
  readonly msiProjectCreated?: (projectFile: string) => Promise<void>
}

async function createTarget(tmpDir: TmpDir, { schema, msi, files, msiProjectCreated }: ProjectOptions) {
  const projectDir = await tmpDir.getTempDir({ prefix: "eb-msi-project-test" })
  const buildResourcesDir = path.join(projectDir, "build")
  await mkdir(buildResourcesDir, { recursive: true })
  const appOutDir = path.join(projectDir, "dist", "win-unpacked")
  for (const file of files ?? [`${PRODUCT_NAME}.exe`, "resources/app.asar", "locales/en-US.pak"]) {
    const filePath = path.join(appOutDir, ...file.split("/"))
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, file)
  }

  const config: Configuration = { appId: "org.electron-builder.testMsi", productName: PRODUCT_NAME, msi }
  const fakePackagerInfo = {
    config,
    metadata: { name: "TestApp", version: "1.1.0", description: "Test Application", author: { name: "Foo Bar", email: "foo@example.com" } },
    devMetadata: null,
    options: {},
    projectDir,
    buildResourcesDir,
    relativeBuildResourcesDirname: "build",
    repositoryInfo: Promise.resolve(null),
    tempDirManager: tmpDir,
    framework: { defaultAppIdPrefix: "com.electron." },
    stageDirPathCustomizer: () => path.join(projectDir, "stage"),
    emitArtifactBuildStarted: async () => {},
    emitMsiProjectCreated: async (projectFile: string) => await msiProjectCreated?.(projectFile),
  }
  const packager = new WinPackager(fakePackagerInfo as any)
  // the default icon would be converted with the icons toolset; the .wxs only references it when there is one
  vi.spyOn(packager, "getIconPath").mockResolvedValue(null)
  const target = new MsiTarget(packager, path.join(projectDir, "dist"))
  // `toolsets.wix` only picks the bundle; resolving it would download it
  ;(target as any).wixToolset = { value: Promise.resolve({ path: path.join(projectDir, "wix"), schema }) }
  return { target, packager, appOutDir }
}

async function renderProject(tmpDir: TmpDir, options: ProjectOptions): Promise<string> {
  const { target, packager, appOutDir } = await createTarget(tmpDir, options)
  return await (target as any).writeManifest(appOutDir, Arch.x64, getEffectiveOptions(target.options, packager))
}

/** The calls MsiTarget makes to light.exe, with a VM that records them instead of running it. */
async function lightCalls(tmpDir: TmpDir, options: ProjectOptions): Promise<Array<[string, Array<string>]>> {
  const { target, appOutDir } = await createTarget(tmpDir, options)
  const vm = { toVmFile: (file: string) => file, exec: vi.fn().mockResolvedValue("") }
  await (target as any).light(["project.wixobj"], vm, path.join(appOutDir, "..", "Test MSI.msi"), appOutDir, "wix", appOutDir)
  return vm.exec.mock.calls.map(([file, args]) => [file, args])
}

/** Runs MsiTarget.build up to candle.exe with a VM that records its calls instead of running anything. */
async function buildUntilCandle(tmpDir: TmpDir, options: ProjectOptions): Promise<Array<[string, Array<string>]>> {
  const { target, appOutDir } = await createTarget(tmpDir, options)
  const vm = { toVmFile: (file: string) => file, exec: vi.fn().mockRejectedValue(new Error("stop after candle")) }
  ;(target as any).vm = vm
  await expect(target.build(appOutDir, Arch.x64)).rejects.toThrow("stop after candle")
  return vm.exec.mock.calls.map(([file, args]) => [file, args])
}

/** The project's lines, trimmed, without the empty ones, so assertions don't depend on the template's indentation. */
function lines(project: string): Array<string> {
  return project
    .split("\n")
    .map(it => it.trim())
    .filter(it => it.length > 0)
}

/** The trimmed lines from the first line that starts with `start` through the next line that starts with `end`. */
function block(project: string, start: string, end: string): Array<string> {
  const all = lines(project)
  const from = all.findIndex(it => it.startsWith(start))
  const to = all.findIndex((it, index) => from >= 0 && index > from && it.startsWith(end))
  if (to < 0) {
    throw new Error(`no lines from ${start} to ${end} in:\n${project}`)
  }
  return all.slice(from, to + 1)
}

function directoryId(dirName: string): string {
  // the same hash MsiTarget uses (sha256 of the relative path, 16 hex chars)
  return "d" + createHash("sha256").update(dirName).digest("hex").slice(0, 16)
}

const programMenuTree = (project: string) => block(project, `<DirectoryRef Id="ProgramMenuFolder">`, "</DirectoryRef>")
const programFilesTree = (project: string) => block(project, `<Directory Id="ProgramFiles64Folder">`, `<Directory Id="APPLICATIONFOLDER"`)

describe("MSI project (.wxs)", () => {
  test("is well-formed XML with both bundles", async ({ expect, tmpDir }) => {
    for (const schema of ["v3", "v4-preview"] as const) {
      const project = await renderProject(tmpDir, { schema, msi: { oneClick: false, menuCategory: "Acme/Tools" } })
      expect(XMLValidator.validate(project), schema).toBe(true)
    }
  })

  describe("WiX 3 menuCategory", () => {
    test("a flat category is one start menu directory, also around APPLICATIONFOLDER", async ({ expect, tmpDir }) => {
      const project = await renderProject(tmpDir, { schema: "v3", msi: { menuCategory: "Acme" } })
      expect(programMenuTree(project)).toEqual([`<DirectoryRef Id="ProgramMenuFolder">`, `<Directory Id="AppProgramMenuDir" Name="Acme"/>`, `</DirectoryRef>`])
      expect(programFilesTree(project)).toEqual([
        `<Directory Id="ProgramFiles64Folder">`,
        `<Directory Id="COMPANYDIR" Name="Acme">`,
        `<Directory Id="APPLICATIONFOLDER" Name="${INSTALL_DIR_NAME}"/>`,
      ])
      expect(project).toContain(`<Shortcut Id="startMenuShortcut" Directory="AppProgramMenuDir"`)
      expect(project).toContain(`<RemoveFolder Id="AppProgramMenuDir" Directory="AppProgramMenuDir" On="uninstall"/>`)
      // WiX 3 has no inline directory syntax
      expect(project).not.toContain(":\\")
    })

    test("a nested category is a nested directory per segment; the shortcut is in the innermost one", async ({ expect, tmpDir }) => {
      const project = await renderProject(tmpDir, { schema: "v3", msi: { menuCategory: "Acme/Tools" } })
      expect(programMenuTree(project)).toEqual([
        `<DirectoryRef Id="ProgramMenuFolder">`,
        `<Directory Id="${directoryId(`menu:Acme`)}" Name="Acme">`,
        `<Directory Id="AppProgramMenuDir" Name="Tools"/>`,
        `</Directory>`,
        `</DirectoryRef>`,
      ])
      expect(programFilesTree(project)).toEqual([
        `<Directory Id="ProgramFiles64Folder">`,
        `<Directory Id="${directoryId(`company:Acme`)}" Name="Acme">`,
        `<Directory Id="COMPANYDIR" Name="Tools">`,
        `<Directory Id="APPLICATIONFOLDER" Name="${INSTALL_DIR_NAME}"/>`,
      ])
      expect(project).toContain(`<Shortcut Id="startMenuShortcut" Directory="AppProgramMenuDir"`)
      // a WiX 3 Directory/@Name can't hold a path
      expect(project).not.toMatch(/<Directory [^>]*Name="[^"]*[\\/][^"]*"/)
    })

    test("leading, trailing and doubled slashes don't give an empty directory name", async ({ expect, tmpDir }) => {
      for (const menuCategory of ["/Acme/Tools/", "\\Acme\\\\Tools\\", "Acme//Tools"]) {
        const project = await renderProject(tmpDir, { schema: "v3", msi: { menuCategory } })
        expect(project, menuCategory).not.toContain(`Name=""`)
        expect(programMenuTree(project), menuCategory).toEqual([
          `<DirectoryRef Id="ProgramMenuFolder">`,
          `<Directory Id="${directoryId(`menu:Acme`)}" Name="Acme">`,
          `<Directory Id="AppProgramMenuDir" Name="Tools"/>`,
          `</Directory>`,
          `</DirectoryRef>`,
        ])
        expect(programFilesTree(project), menuCategory).toEqual([
          `<Directory Id="ProgramFiles64Folder">`,
          `<Directory Id="${directoryId(`company:Acme`)}" Name="Acme">`,
          `<Directory Id="COMPANYDIR" Name="Tools">`,
          `<Directory Id="APPLICATIONFOLDER" Name="${INSTALL_DIR_NAME}"/>`,
        ])
      }
    })

    test("a category of only slashes is no category", async ({ expect, tmpDir }) => {
      const project = await renderProject(tmpDir, { schema: "v3", msi: { menuCategory: "/" } })
      expect(project).not.toContain(`Name=""`)
      expect(project).not.toContain("AppProgramMenuDir")
      expect(project).not.toContain("COMPANYDIR")
      expect(project).toContain(`<Shortcut Id="startMenuShortcut" Directory="ProgramMenuFolder"`)
    })
  })

  test("the legacy bundle keeps the inline directory syntax for the category", async ({ expect, tmpDir }) => {
    const project = await renderProject(tmpDir, { schema: "v4-preview", msi: { menuCategory: "Acme/Tools" } })
    expect(project).toContain(`<Directory Id="AppProgramMenuDir" Name="ProgramMenuFolder:\\Acme\\Tools\\"/>`)
    expect(programFilesTree(project)).toEqual([
      `<Directory Id="ProgramFiles64Folder">`,
      `<Directory Id="COMPANYDIR" Name="Acme\\Tools">`,
      `<Directory Id="APPLICATIONFOLDER" Name="${INSTALL_DIR_NAME}"/>`,
    ])
    expect(project).not.toContain("<DirectoryRef")
  })

  describe("assisted installer (oneClick: false)", () => {
    for (const schema of ["v3", "v4-preview"] as const) {
      test(`references the WixUI_InstallDir dialog set (${schema})`, async ({ expect, tmpDir }) => {
        const project = await renderProject(tmpDir, { schema, msi: { oneClick: false } })
        expect(project).toContain(`<UIRef Id="WixUI_InstallDir"/>`)
        expect(project).toContain(`<Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="runAfterFinish">`)
        // the assisted installer runs the app from the exit dialog, not from the execute sequence
        expect(project).not.toContain(`<Custom Action="runAfterFinish"`)
      })
    }

    test("one-click has no UI reference", async ({ expect, tmpDir }) => {
      const project = await renderProject(tmpDir, { schema: "v3" })
      expect(project).not.toContain("WixUI_InstallDir")
      expect(project).toContain(`<Custom Action="runAfterFinish" After="InstallFinalize">`)
    })

    test("light links WixUIExtension, which has the dialogs, only for the assisted installer", async ({ expect, tmpDir }) => {
      const assisted = await lightCalls(tmpDir, { schema: "v3", msi: { oneClick: false } })
      expect(assisted).toHaveLength(1)
      const [file, args] = assisted[0]
      expect(path.basename(file)).toBe("light.exe")
      expect(args.slice(-3)).toEqual(["-ext", "WixUIExtension", "project.wixobj"])
      const oneClick = await lightCalls(tmpDir, { schema: "v3" })
      expect(oneClick).toHaveLength(1)
      expect(oneClick[0][1]).not.toContain("WixUIExtension")
    })
  })

  describe("file ids", () => {
    // what WiX 3 candle accepts as a File/@Id: CNDL0014 for other characters, CNDL1026 (an error with -wx) over 72 characters
    const wix3Identifier = /^[A-Za-z_][A-Za-z0-9_.]{0,71}$/
    const fileIds = (project: string) => Array.from(project.matchAll(/<File [^>]* Id="([^"]*)"/g), it => it[1])
    const hashedId = (packagePath: string) => `f${createHash("sha256").update(packagePath).digest("hex").slice(0, 16)}`

    // app-tree file names are not trusted input; `'` and `&` are valid in file names on every OS (`"`, `<` and `>` are not on Windows)
    const untrustedName = "a'b&c.txt"

    test("a root-level file id is XML-escaped, like the file name, with the legacy bundle", async ({ expect, tmpDir }) => {
      const project = await renderProject(tmpDir, { schema: "v4-preview", files: [`${PRODUCT_NAME}.exe`, untrustedName] })
      expect(XMLValidator.validate(project)).toBe(true)
      expect(project).toContain(`<File Name="a&apos;b&amp;c.txt"`)
      expect(project).toContain(` Id="a&apos;b&amp;c.txt_f"`)
    })

    test("the legacy bundle keeps the file name as the root-level file id", async ({ expect, tmpDir }) => {
      // WiX 4 accepts `-` in an id; the ids, and so the component ids, of an existing legacy installer stay the same
      const project = await renderProject(tmpDir, { schema: "v4-preview", files: [`${PRODUCT_NAME}.exe`, "vulkan-1.dll"] })
      expect(project).toContain(` Id="vulkan-1.dll_f"`)
    })

    test("with WiX 3, a root-level file name that is not an identifier gets a hashed id", async ({ expect, tmpDir }) => {
      // Electron ships vulkan-1.dll at the root of the app dir: CNDL0014 for `vulkan-1.dll_f`
      const longName = `${"a".repeat(70)}.dll`
      const names = ["vulkan-1.dll", "1st.dll", untrustedName, longName]
      const project = await renderProject(tmpDir, { schema: "v3", files: [`${PRODUCT_NAME}.exe`, ...names] })
      expect(XMLValidator.validate(project)).toBe(true)
      for (const name of names) {
        expect(project, name).toContain(`<File Name="${name.replace("&", "&amp;").replace("'", "&apos;")}" Source="$(var.appDir)${path.sep}`)
        expect(project, name).toContain(` Id="${hashedId(name)}"`)
      }
      expect(project).not.toContain("vulkan-1.dll_f")
    })

    test("with WiX 3, every file id is an identifier, and unique", async ({ expect, tmpDir }) => {
      const files = [
        `${PRODUCT_NAME}.exe`,
        "vulkan-1.dll",
        "LICENSE.electron.txt",
        "resources/app.asar",
        "locales/en-US.pak",
        "locales/de/en-US.pak",
        `${"b".repeat(68)}.d`,
        `${"b".repeat(69)}.d`,
        untrustedName,
      ]
      const ids = fileIds(await renderProject(tmpDir, { schema: "v3", files }))
      expect(ids).toHaveLength(files.length)
      for (const id of ids) {
        expect(id).toMatch(wix3Identifier)
      }
      expect(new Set(ids).size).toBe(ids.length)
      // 72 characters is still an identifier, so the name is kept
      expect(ids).toContain(`${"b".repeat(68)}.d_f`)
      expect(ids).toContain(hashedId(`${"b".repeat(69)}.d`))
    })

    test("ordinary root-level file ids are unchanged", async ({ expect, tmpDir }) => {
      for (const schema of ["v3", "v4-preview"] as const) {
        const project = await renderProject(tmpDir, { schema, files: [`${PRODUCT_NAME}.exe`, "LICENSE.electron.txt", "d3dcompiler_47.dll"] })
        expect(project, schema).toContain(` Id="LICENSE.electron.txt_f"`)
        expect(project, schema).toContain(` Id="d3dcompiler_47.dll_f"`)
        expect(project, schema).toContain(` Id="mainExecutable"`)
      }
    })
  })

  describe("msiProjectCreated with WiX 3", () => {
    // what the "wix args" e2e test inserts, with the namespace of either bundle
    const insertCloseApplication = (namespace: string) => async (projectFile: string) => {
      const project = await readFile(projectFile, "utf8")
      await writeFile(projectFile, project.replace("</Product>", `<util:CloseApplication xmlns:util="${namespace}" Target="Test MSI.exe"/></Product>`))
    }

    test("a hook that adds a WiX 4 namespace fails the build before candle runs", async ({ expect, tmpDir }) => {
      const { target, appOutDir } = await createTarget(tmpDir, { schema: "v3", msiProjectCreated: insertCloseApplication("http://wixtoolset.org/schemas/v4/wxs/util") })
      const vm = { toVmFile: (file: string) => file, exec: vi.fn().mockResolvedValue("") }
      ;(target as any).vm = vm
      await expect(target.build(appOutDir, Arch.x64)).rejects.toThrow(InvalidConfigurationError)
      expect(vm.exec).not.toHaveBeenCalled()
    })

    test("a hook that adds the WiX 3 namespace builds", async ({ expect, tmpDir }) => {
      const calls = await buildUntilCandle(tmpDir, { schema: "v3", msiProjectCreated: insertCloseApplication("http://schemas.microsoft.com/wix/UtilExtension") })
      expect(calls.map(([file]) => path.basename(file))).toEqual(["candle.exe"])
    })

    test("the legacy bundle compiles a hook's WiX 4 namespace", async ({ expect, tmpDir }) => {
      const calls = await buildUntilCandle(tmpDir, { schema: "v4-preview", msiProjectCreated: insertCloseApplication("http://wixtoolset.org/schemas/v4/wxs/util") })
      expect(calls.map(([file]) => path.basename(file))).toEqual(["candle.exe"])
    })
  })
})
