import { Arch } from "builder-util"
import { renderDirectoryTree } from "app-builder-lib/src/targets/win/MsiTarget"
import { getCandleArch, getWixArch, getWixNamespace, resolveWixVersion } from "app-builder-lib/src/toolsets/wix"
import { describe, expect, test } from "vitest"

describe("toolsets.wix", () => {
  test("an unset wix keeps the legacy bundle; latest selects WiX 3.14.1", () => {
    expect(resolveWixVersion(undefined)).toBe("0.0.0")
    expect(resolveWixVersion(null)).toBe("0.0.0")
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
