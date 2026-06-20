import { describe, expect, test } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { statSync } from "fs"

// Import from src/ path so vitest can intercept relative imports inside the SUT
import { addLicenseToDmg } from "dmg-builder/src/dmgLicense"

// ─── Minimal mock packager ──────────────────────────────────────────────────

function makeMockPackager(resourceFiles: string[], buildResourcesDir: string) {
  return {
    resourceList: Promise.resolve(resourceFiles),
    buildResourcesDir,
    debugLogger: { add: () => undefined },
    // Minimal getResource: returns the path if it's an existing absolute path,
    // else resolves relative to buildResourcesDir
    getResource: (custom: string | null | undefined) => {
      if (custom == null) {
        return null
      }
      if (path.isAbsolute(custom)) {
        try {
          statSync(custom)
          return custom
        } catch {
          return null
        }
      }
      const resolved = path.join(buildResourcesDir, custom)
      try {
        statSync(resolved)
        return resolved
      } catch {
        return null
      }
    },
  } as any
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function writeYml(dir: string, name: string, content: string) {
  await fs.writeFile(path.join(dir, name), content, "utf-8")
}

async function writeJson(dir: string, name: string, obj: object) {
  await fs.writeFile(path.join(dir, name), JSON.stringify(obj), "utf-8")
}

// ─── Suite ──────────────────────────────────────────────────────────────────

describe("addLicenseToDmg", () => {
  test("returns null when no license files are present", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const packager = makeMockPackager([], tmpDirPath)
    expect(await addLicenseToDmg(packager)).toBeNull()
  })

  test("single license file with no button files", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "License text", "utf-8")
    const packager = makeMockPackager(["license_en.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result).not.toBeNull()
    expect(result!["default-language"]).toBe("en_US")
    expect(result!.licenses).toEqual({ en_US: path.join(tmpDirPath, "license_en.txt") })
    expect(result!.buttons).toBeUndefined()
  })

  test("multiple license files — all appear in licenses map; first sets default-language", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    // getLicenseAssets sorts to put `_en` first
    for (const name of ["license_de.txt", "license_fr.txt", "license_en.txt"]) {
      await fs.writeFile(path.join(tmpDirPath, name), "x", "utf-8")
    }
    const packager = makeMockPackager(["license_de.txt", "license_fr.txt", "license_en.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result).not.toBeNull()
    // en_US is sorted first by getLicenseAssets
    expect(result!["default-language"]).toBe("en_US")
    expect(Object.keys(result!.licenses).sort()).toEqual(["de_DE", "en_US", "fr_FR"])
    expect(result!.licenses["en_US"]).toBe(path.join(tmpDirPath, "license_en.txt"))
    expect(result!.licenses["de_DE"]).toBe(path.join(tmpDirPath, "license_de.txt"))
    expect(result!.licenses["fr_FR"]).toBe(path.join(tmpDirPath, "license_fr.txt"))
  })

  test("RTF license file is included verbatim in licenses map", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_de.rtf"), "{\\rtf1 hello}", "utf-8")
    const packager = makeMockPackager(["license_de.rtf"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.licenses["de_DE"]).toBe(path.join(tmpDirPath, "license_de.rtf"))
  })

  test("language key uses underscores (en_US not en-US)", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    const packager = makeMockPackager(["license_en.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(Object.keys(result!.licenses)).toEqual(["en_US"])
    expect(result!["default-language"]).toBe("en_US")
  })

  test("YAML button file — fields mapped correctly", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await writeYml(
      tmpDirPath,
      "licensebuttons_en.yml",
      ["languageName: English", "agree: Agree", "disagree: Disagree", "print: Print", "save: Save", "description: Custom message"].join("\n")
    )
    const packager = makeMockPackager(["license_en.txt", "licensebuttons_en.yml"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.buttons).toEqual({
      en_US: {
        language: "English",
        agree: "Agree",
        disagree: "Disagree",
        print: "Print",
        save: "Save",
        message: "Custom message",
      },
    })
  })

  test("JSON button file — fields mapped correctly", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_fr.txt"), "x", "utf-8")
    await writeJson(tmpDirPath, "licensebuttons_fr.json", {
      languageName: "Français",
      agree: "J'accepte",
      disagree: "Je refuse",
      print: "Imprimer",
      save: "Sauvegarder",
      description: "Ma description",
    })
    const packager = makeMockPackager(["license_fr.txt", "licensebuttons_fr.json"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.buttons!["fr_FR"]).toMatchObject({
      language: "Français",
      agree: "J'accepte",
      message: "Ma description",
    })
  })

  test("legacy `description` field maps to `message`", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await writeYml(tmpDirPath, "licensebuttons_en.yml", "description: Legacy text\nagree: OK\ndisagree: No")
    const packager = makeMockPackager(["license_en.txt", "licensebuttons_en.yml"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.buttons!["en_US"].message).toBe("Legacy text")
    expect(result!.buttons!["en_US"]).not.toHaveProperty("description")
  })

  test("`message` field takes precedence over `description`", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await writeYml(tmpDirPath, "licensebuttons_en.yml", "message: Newer text\ndescription: Old text")
    const packager = makeMockPackager(["license_en.txt", "licensebuttons_en.yml"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.buttons!["en_US"].message).toBe("Newer text")
  })

  test("`lang` field from button file is dropped from output", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await writeYml(tmpDirPath, "licensebuttons_en.yml", "lang: en-US\nlanguageName: English\nagree: Agree")
    const packager = makeMockPackager(["license_en.txt", "licensebuttons_en.yml"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.buttons!["en_US"]).not.toHaveProperty("lang")
  })

  test("button without optional fields — only present fields appear", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await writeYml(tmpDirPath, "licensebuttons_en.yml", "agree: Agree\ndisagree: Disagree")
    const packager = makeMockPackager(["license_en.txt", "licensebuttons_en.yml"], tmpDirPath)

    const result = await addLicenseToDmg(packager)
    const btn = result!.buttons!["en_US"]

    expect(btn.agree).toBe("Agree")
    expect(btn.disagree).toBe("Disagree")
    expect(btn).not.toHaveProperty("language")
    expect(btn).not.toHaveProperty("message")
    expect(btn).not.toHaveProperty("print")
    expect(btn).not.toHaveProperty("save")
  })

  test("multiple button files — each keyed by its own langWithRegion", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    for (const name of ["license_en.txt", "license_fr.txt"]) {
      await fs.writeFile(path.join(tmpDirPath, name), "x", "utf-8")
    }
    await writeYml(tmpDirPath, "licensebuttons_en.yml", "languageName: English\nagree: Agree")
    await writeJson(tmpDirPath, "licensebuttons_fr.json", { languageName: "Français", agree: "J'accepte" })

    const packager = makeMockPackager(["license_en.txt", "license_fr.txt", "licensebuttons_en.yml", "licensebuttons_fr.json"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(Object.keys(result!.buttons!).sort()).toEqual(["en_US", "fr_FR"])
    expect(result!.buttons!["en_US"].language).toBe("English")
    expect(result!.buttons!["fr_FR"].language).toBe("Français")
  })

  test("button file without matching license language — button entry still included", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await writeJson(tmpDirPath, "licensebuttons_fr.json", { languageName: "Français", agree: "Accepter" })

    const packager = makeMockPackager(["license_en.txt", "licensebuttons_fr.json"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    // licenses only has en_US; buttons has fr_FR (dmgbuild handles the mismatch)
    expect(Object.keys(result!.licenses)).toEqual(["en_US"])
    expect(result!.buttons!["fr_FR"].agree).toBe("Accepter")
  })

  test("Japanese license key appears in licenses map as ja_JP", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_ja.txt"), "こんにちは", "utf-8")
    const packager = makeMockPackager(["license_ja.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result).not.toBeNull()
    expect(result!.licenses["ja_JP"]).toBe(path.join(tmpDirPath, "license_ja.txt"))
    expect(result!["default-language"]).toBe("ja_JP")
  })

  test("Korean license key appears in licenses map as ko_KR", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_ko.txt"), "안녕하세요", "utf-8")
    const packager = makeMockPackager(["license_ko.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result).not.toBeNull()
    expect(result!.licenses["ko_KR"]).toBe(path.join(tmpDirPath, "license_ko.txt"))
  })

  test("CJK button file is included in buttons map", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_ja.txt"), "x", "utf-8")
    await writeJson(tmpDirPath, "licensebuttons_ja.json", { languageName: "日本語", agree: "同意する", disagree: "同意しない" })
    const packager = makeMockPackager(["license_ja.txt", "licensebuttons_ja.json"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(result!.buttons!["ja_JP"]).toBeDefined()
    expect(result!.buttons!["ja_JP"].language).toBe("日本語")
    expect(result!.buttons!["ja_JP"].agree).toBe("同意する")
  })

  test("duplicate license language throws InvalidConfigurationError", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    // Both license_en.txt and eula_en.txt map to en_US — must not silently overwrite
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "License", "utf-8")
    await fs.writeFile(path.join(tmpDirPath, "eula_en.txt"), "EULA", "utf-8")
    const packager = makeMockPackager(["license_en.txt", "eula_en.txt"], tmpDirPath)

    await expect(addLicenseToDmg(packager)).rejects.toThrow(/Multiple license files found for language "en_US"/)
  })

  test("non-license files in resourceList are ignored", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    await fs.writeFile(path.join(tmpDirPath, "background.png"), "x", "utf-8")
    await fs.writeFile(path.join(tmpDirPath, "icon.icns"), "x", "utf-8")

    const packager = makeMockPackager(["license_en.txt", "background.png", "icon.icns"], tmpDirPath)

    const result = await addLicenseToDmg(packager)

    expect(Object.keys(result!.licenses)).toEqual(["en_US"])
  })

  // ─── Explicit license config (DmgOptions.license) ───────────────────────────

  test("explicit string license — resolves to en_US, ignores file convention", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const licenseFile = path.join(tmpDirPath, "my-license.rtf")
    await fs.writeFile(licenseFile, "{\\rtf1 My license}", "utf-8")
    // Also write a convention file to confirm it is NOT used
    await fs.writeFile(path.join(tmpDirPath, "license_de.txt"), "Hallo", "utf-8")
    const packager = makeMockPackager(["license_de.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager, licenseFile)

    expect(result!["default-language"]).toBe("en_US")
    expect(Object.keys(result!.licenses)).toEqual(["en_US"])
    expect(result!.licenses["en_US"]).toBe(licenseFile)
    // Convention-based German license must not appear
    expect(result!.licenses["de_DE"]).toBeUndefined()
  })

  test("explicit map license — uses provided language map verbatim", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const enFile = path.join(tmpDirPath, "license.rtf")
    const deFile = path.join(tmpDirPath, "license_de.txt")
    await fs.writeFile(enFile, "{\\rtf1 EN}", "utf-8")
    await fs.writeFile(deFile, "DE Lizenz", "utf-8")
    const packager = makeMockPackager([], tmpDirPath)

    const result = await addLicenseToDmg(packager, { en_US: enFile, de_DE: deFile })

    expect(result!["default-language"]).toBe("en_US")
    expect(result!.licenses["en_US"]).toBe(enFile)
    expect(result!.licenses["de_DE"]).toBe(deFile)
    expect(result!.buttons).toBeUndefined()
  })

  test("explicit map license — first key is default-language", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const deFile = path.join(tmpDirPath, "license_de.txt")
    const enFile = path.join(tmpDirPath, "license.txt")
    await fs.writeFile(deFile, "DE", "utf-8")
    await fs.writeFile(enFile, "EN", "utf-8")
    const packager = makeMockPackager([], tmpDirPath)

    const result = await addLicenseToDmg(packager, { de_DE: deFile, en_US: enFile })

    expect(result!["default-language"]).toBe("de_DE")
  })

  test("explicit null license — returns null (no license dialog)", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    await fs.writeFile(path.join(tmpDirPath, "license_en.txt"), "x", "utf-8")
    const packager = makeMockPackager(["license_en.txt"], tmpDirPath)

    const result = await addLicenseToDmg(packager, null)

    expect(result).toBeNull()
  })

  test("explicit string pointing to missing file — throws InvalidConfigurationError", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const packager = makeMockPackager([], tmpDirPath)

    await expect(addLicenseToDmg(packager, "/nonexistent/license.rtf")).rejects.toThrow(/dmg\.license file not found/)
  })

  test("explicit map with missing file — throws InvalidConfigurationError naming the language", async ({ tmpDir }) => {
    const tmpDirPath = await tmpDir.createTempDir()
    const packager = makeMockPackager([], tmpDirPath)

    await expect(addLicenseToDmg(packager, { fr_FR: "/nonexistent/fr.rtf" })).rejects.toThrow(/fr_FR/)
  })
})
