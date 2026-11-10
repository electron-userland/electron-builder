import { keychainTrustedApplications } from "app-builder-lib/src/codeSign/mac/macCodeSign.js"
import { MacTargetHelper } from "app-builder-lib/internal"
import { Executables, InvalidConfigurationError } from "builder-util"
import { chmod, mkdir, writeFile } from "fs/promises"
import * as path from "path"
import { pathToFileURL } from "url"
import { afterEach, beforeEach } from "vitest"

// The codesign that electron-builder starts comes from toolsets.executables (or /usr/bin/codesign), never from PATH. The tools are
// stand-in scripts on a pinned macOS host, so this runs on macOS and Linux.

const originalPlatform = process.platform

beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "darwin", configurable: true })
})

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true })
})

async function tool(dir: string, name: string, script = "#!/bin/sh\n"): Promise<string> {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, name)
  await writeFile(file, script)
  await chmod(file, 0o755)
  return file
}

const uri = (file: string) => pathToFileURL(file).href

// readSigningTeamId only reads `this` for nothing but the codesign call
const readSigningTeamId = (file: string) => MacTargetHelper.prototype.readSigningTeamId.call({} as MacTargetHelper, file)

describe.skipIf(process.platform === "win32")("codesign from toolsets.executables", { concurrent: false }, () => {
  test("the foreign-signature scan runs the configured codesign -d", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "codesign-team-id" })
    // codesign -d reports on stderr
    const codesign = await tool(dir, "codesign", '#!/bin/sh\necho "TeamIdentifier=ABCDE12345" >&2\n')
    expect(await Executables.run({ codesign: uri(codesign) }, () => readSigningTeamId("/out/mac/My.app/Contents/Frameworks/Foo.dylib"))).toBe("ABCDE12345")
  })

  test("the foreign-signature scan fails on a codesign that cannot be located, instead of reading the file as unsigned", async ({ expect, tmpDir }) => {
    const missing = path.join(await tmpDir.getTempDir({ prefix: "codesign-team-id" }), "missing")
    await expect(Executables.run({ codesign: uri(missing) }, () => readSigningTeamId("/out/My.dylib"))).rejects.toBeInstanceOf(InvalidConfigurationError)
  })

  test("the imported signing keys trust the configured codesign and productbuild, and /usr/bin/codesign for @electron/osx-sign", async ({ expect, tmpDir }) => {
    const dir = await tmpDir.getTempDir({ prefix: "codesign-keychain" })
    const codesign = await tool(dir, "codesign")
    const productbuild = await tool(dir, "productbuild")
    expect(Executables.run({ codesign: uri(codesign), productbuild: uri(productbuild) }, () => keychainTrustedApplications())).toEqual([
      "/usr/bin/codesign",
      codesign,
      productbuild,
    ])
    const missing = uri(path.join(dir, "missing"))
    expect(() => Executables.run({ codesign: missing, productbuild: uri(productbuild) }, () => keychainTrustedApplications())).toThrow("toolsets.executables.codesign")
  })
})
