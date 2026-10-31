import { Arch } from "builder-util"
import { renderDirectoryTree } from "app-builder-lib/src/targets/win/MsiTarget"
import { assertNoWix4Namespaces, findWix4Namespaces, getCandleArch, getWixArch, getWixNamespace, resolveWixVersion } from "app-builder-lib/src/toolsets/wix"
import { InvalidConfigurationError } from "builder-util"
import { describe, expect, test } from "vitest"

describe("toolsets.wix", () => {
  test("unset and latest select WiX 3.14.1; 0.0.0 keeps the legacy bundle", () => {
    expect(resolveWixVersion(undefined)).toBe("2.0.0")
    expect(resolveWixVersion(null)).toBe("2.0.0")
    expect(resolveWixVersion("0.0.0")).toBe("0.0.0")
    expect(resolveWixVersion("2.0.0")).toBe("2.0.0")
    expect(resolveWixVersion("latest")).toBe("2.0.0")
  })

  test("the .wxs namespace follows the bundle", () => {
    expect(getWixNamespace("v3")).toBe("http://schemas.microsoft.com/wix/2006/wi")
    expect(getWixNamespace("v4-preview")).toBe("http://wixtoolset.org/schemas/v4/wxs")
  })

  test("arm64 is built as arm64 with WiX 3 and as x64 with the legacy bundle", () => {
    expect(getWixArch(Arch.arm64, "v3")).toBe(Arch.arm64)
    expect(getWixArch(Arch.arm64, "v4-preview")).toBe(Arch.x64)
    for (const schema of ["v3", "v4-preview"] as const) {
      expect(getWixArch(Arch.x64, schema)).toBe(Arch.x64)
      expect(getWixArch(Arch.ia32, schema)).toBe(Arch.ia32)
    }
    expect([Arch.ia32, Arch.x64, Arch.arm64].map(getCandleArch)).toEqual(["x86", "x64", "arm64"])
  })
})

describe("WiX 4 namespaces in a WiX 3 project", () => {
  const util4 = "http://wixtoolset.org/schemas/v4/wxs/util"

  test("finds each declared WiX 4 namespace once, prefixed or default, with either quote", () => {
    const project = [
      `<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">`,
      `<util:CloseApplication xmlns:util="${util4}"/>`,
      `<util:CloseApplication xmlns:util='${util4}'/>`,
      `<Fragment xmlns = "http://wixtoolset.org/schemas/v4/wxs/firewall"/>`,
      `</Wix>`,
    ].join("\n")
    expect(findWix4Namespaces(project)).toEqual([util4, "http://wixtoolset.org/schemas/v4/wxs/firewall"])
  })

  test("ignores WiX 3 namespaces and a WiX 4 URL that isn't a namespace declaration", () => {
    expect(findWix4Namespaces(`<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi"><util:X xmlns:util="http://schemas.microsoft.com/wix/UtilExtension"/></Wix>`)).toEqual([])
    expect(findWix4Namespaces(`<Property Id="DOCS" Value="http://wixtoolset.org/schemas/v4/wxs"/>`)).toEqual([])
  })

  test("fails a WiX 3 build with an InvalidConfigurationError that names the namespace and both fixes", () => {
    const project = `<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi"><util:X xmlns:util="${util4}"/></Wix>`
    let error: unknown = null
    try {
      assertNoWix4Namespaces(project, "v3")
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(InvalidConfigurationError)
    const message = (error as Error).message
    expect(message).toContain(`"${util4}"`)
    expect(message).toContain("msiProjectCreated")
    expect(message).toContain("http://schemas.microsoft.com/wix/UtilExtension")
    expect(message).toContain(`toolsets.wix to "0.0.0"`)
    expect(message).toContain("electron-builder v27")
    expect(message).toContain("https://www.electron.build/docs/migration/v27-build-changes#toolset-defaults-resolve-to-latest-newest-bundle")
  })

  test("the legacy bundle reads WiX 4 namespaces, so it isn't checked", () => {
    expect(() => assertNoWix4Namespaces(`<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs"><util:X xmlns:util="${util4}"/></Wix>`, "v4-preview")).not.toThrow()
  })

  test("a WiX 3 project without WiX 4 namespaces passes", () => {
    expect(() => assertNoWix4Namespaces(`<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi"/>`, "v3")).not.toThrow()
  })
})

describe("renderDirectoryTree (WiX 3 directories)", () => {
  const idOf = (dirName: string) => `id(${dirName})`

  test("declares every ancestor once, nested under the root", () => {
    expect(renderDirectoryTree("APPLICATIONFOLDER", ["resources/app.asar.unpacked/a", "resources", "locales", "resources/app.asar.unpacked/b"], "/", idOf)).toEqual([
      `<DirectoryRef Id="APPLICATIONFOLDER">`,
      `  <Directory Id="id(resources)" Name="resources">`,
      `    <Directory Id="id(resources/app.asar.unpacked)" Name="app.asar.unpacked">`,
      `      <Directory Id="id(resources/app.asar.unpacked/a)" Name="a"/>`,
      `      <Directory Id="id(resources/app.asar.unpacked/b)" Name="b"/>`,
      `    </Directory>`,
      `  </Directory>`,
      `  <Directory Id="id(locales)" Name="locales"/>`,
      `</DirectoryRef>`,
    ])
  })

  test("ids are computed from the full relative path, with the given separator", () => {
    expect(renderDirectoryTree("ROOT", ["a\\b"], "\\", idOf)).toEqual([
      `<DirectoryRef Id="ROOT">`,
      `  <Directory Id="id(a)" Name="a">`,
      `    <Directory Id="id(a\\b)" Name="b"/>`,
      `  </Directory>`,
      `</DirectoryRef>`,
    ])
  })

  test("escapes directory names for XML", () => {
    expect(renderDirectoryTree("ROOT", ["R&D <x>"], "/", () => "d")).toContain(`  <Directory Id="d" Name="R&amp;D &lt;x&gt;"/>`)
  })

  test("renders nothing without directories", () => {
    expect(renderDirectoryTree("ROOT", [], "/", idOf)).toEqual([])
  })
})
