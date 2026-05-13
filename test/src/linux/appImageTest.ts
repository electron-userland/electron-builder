import { Platform } from "app-builder-lib/src"
import { validateCriticalPathString } from "app-builder-lib/src/targets/appimage/appImageUtil"
import { copyMimeTypes } from "app-builder-lib/src/targets/appimage/appLauncher"
import { Arch, InvalidConfigurationError, TmpDir } from "builder-util"
import { execSync, spawnSync } from "child_process"
import * as fs from "fs-extra"
import * as path from "path"
import { afterAll } from "vitest"
import { assertPack } from "../helpers/packTester"
import { verifyAsarFileTree } from "../helpers/asarVerifier"

const tmpDir = new TmpDir("appimage-env-test")

afterAll(async () => {
  await tmpDir.cleanup()
})

describe("validateCriticalPathString", () => {
  test("rejects double quotes", ({ expect }) => {
    expect(() => validateCriticalPathString('my"app', "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects single quotes", ({ expect }) => {
    expect(() => validateCriticalPathString("my'app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects dollar sign", ({ expect }) => {
    expect(() => validateCriticalPathString("my$app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects forward slash", ({ expect }) => {
    expect(() => validateCriticalPathString("my/app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects backtick", ({ expect }) => {
    expect(() => validateCriticalPathString("my`app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects colon", ({ expect }) => {
    expect(() => validateCriticalPathString("my:app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects @", ({ expect }) => {
    expect(() => validateCriticalPathString("my@app", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("rejects empty string", ({ expect }) => {
    expect(() => validateCriticalPathString("", "executableName")).toThrow(InvalidConfigurationError)
  })

  test("allows alphanumeric, hyphens, underscores, dots, and spaces", ({ expect }) => {
    expect(() => validateCriticalPathString("My App-1.0_beta", "executableName")).not.toThrow()
  })

  test("allows Unicode letters (e.g. German ß)", ({ expect }) => {
    expect(() => validateCriticalPathString("Test App ßW", "productFilename")).not.toThrow()
  })
})

describe("copyMimeTypes - invalid extension handling", () => {
  const valid = { mimeType: "application/x-test", ext: "txt" }
  const invalid = { mimeType: "application/x-test", ext: "my ext" }
  test("skips extension containing a space", async ({ expect }) => {
    const dir = await tmpDir.getTempDir({ prefix: "mime-types-test" })
    const result = await copyMimeTypes(dir, {
      fileAssociations: [invalid, valid],
      productName: "TestApp",
      executableName: "testapp",
    })
    expect(result).not.toBeNull()
    const xml = await fs.readFile(path.join(dir, result!), "utf8")
    expect(xml).not.toContain('<glob pattern="*.my ext"/>')
  })

  test("includes valid alphanumeric extensions in the XML glob", async ({ expect }) => {
    const dir = await tmpDir.getTempDir({ prefix: "mime-types-test" })
    const result = await copyMimeTypes(dir, {
      fileAssociations: [valid],
      productName: "TestApp",
      executableName: "testapp",
    })
    expect(result).not.toBeNull()
    const xml = await fs.readFile(path.join(dir, result!), "utf8")
    expect(xml).toContain('<glob pattern="*.txt"/>')
  })
})

describe.heavy.ifLinux("AppImage", () => {
  test.ifEnv(process.env.RUN_APP_IMAGE_TEST === "true")("AppRun entrypoint", async ({ expect }) => {
    await assertPack(
      expect,
      "test-app",
      {
        targets: Platform.LINUX.createTarget("AppImage", Arch.x64),
        config: { productName: "TestApp", executableName: "TestApp", compression: "store", toolsets: { appimage: "1.0.3" } },
      },
      {
        packed: async ctx => {
          const appImagePath = ctx.getAppPath(Platform.LINUX, Arch.x64)

          const extractDir = await tmpDir.getTempDir({ prefix: "squashfs" })
          execSync(`"${appImagePath}" --appimage-extract`, { cwd: extractDir, stdio: "inherit" })

          const appRunContent = fs.readFileSync(path.join(extractDir, "squashfs-root", "AppRun"), "utf8")
          verifyAsarFileTree

          const exportLines = appRunContent
            .split("\n")
            .filter(l => /^export (PATH|XDG_DATA_DIRS|LD_LIBRARY_PATH|GSETTINGS_SCHEMA_DIR)=/.test(l))
            .join("\n")

          const APPDIR = path.join(extractDir, "squashfs-root")

          function evalExports(env: Record<string, string> = {}): string[] {
            const result = spawnSync("bash", ["-c", `APPDIR="${APPDIR}"\n${exportLines}\nprintf '%s\\n' "$PATH" "$XDG_DATA_DIRS" "$LD_LIBRARY_PATH" "$GSETTINGS_SCHEMA_DIR"`], {
              encoding: "utf8",
              env: { ...process.env, ...env },
            })
            return (result.stdout ?? "").trim().split("\n")
          }

          function hasEmptyComponent(v: string) {
            return v.split(":").some(p => p === "")
          }

          const [pathVal, xdgVal, ldVal, gsettingsVal] = evalExports()
          expect(hasEmptyComponent(pathVal), `PATH has empty component: "${pathVal}"`).toBe(false)
          expect(hasEmptyComponent(xdgVal), `XDG_DATA_DIRS has empty component: "${xdgVal}"`).toBe(false)
          expect(hasEmptyComponent(ldVal), `LD_LIBRARY_PATH has empty component: "${ldVal}"`).toBe(false)
          expect(hasEmptyComponent(gsettingsVal), `GSETTINGS_SCHEMA_DIR has empty component: "${gsettingsVal}"`).toBe(false)

          const [, xdgSet, ldSet] = evalExports({ LD_LIBRARY_PATH: "/custom/lib", XDG_DATA_DIRS: "/custom/share" })
          expect(ldSet).toContain("/custom/lib")
          expect(xdgSet).toContain("/custom/share")
          expect(hasEmptyComponent(ldSet), `LD_LIBRARY_PATH has empty component: "${ldSet}"`).toBe(false)
          expect(hasEmptyComponent(xdgSet), `XDG_DATA_DIRS has empty component: "${xdgSet}"`).toBe(false)

          for (const dir of xdgVal.split(":").filter(Boolean)) {
            expect(dir, `XDG_DATA_DIRS entry "${dir}" must be absolute`).toMatch(/^\//)
          }
        },
      }
    )
  })
})
