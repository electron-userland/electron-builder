import { ResourceEditOptions, editWindowsResources } from "app-builder-lib/src/util/resEdit"
import * as fs from "fs/promises"
import * as os from "os"
import path from "path"
import { NtExecutable, NtExecutableResource, Resource } from "resedit"
import { afterEach, beforeEach } from "vitest"

interface PeSnapshot {
  versionStrings: Array<{ lang: number; codepage: number; strings: Record<string, string> }>
  manifestXml: string | null
}

function readPeSnapshot(buf: Buffer): PeSnapshot {
  const res = NtExecutableResource.from(NtExecutable.from(buf))
  const viList = Resource.VersionInfo.fromEntries(res.entries)
  const vi = viList[0]
  if (!vi) {
    throw new Error("no version info found in PE")
  }
  const versionStrings = vi.getAllLanguagesForStringValues().map(lang => ({
    lang: lang.lang,
    codepage: lang.codepage,
    strings: vi.getStringValues(lang),
  }))
  const manifestEntry = res.entries.find(e => e.type === 24 && e.id === 1)
  return {
    versionStrings,
    manifestXml: manifestEntry ? Buffer.from(manifestEntry.bin).toString("utf-8") : null,
  }
}

function makePeBuffer(opts: { withVersionInfo?: boolean; langs?: number[]; withManifest?: boolean; manifestXml?: string } = {}): Buffer {
  const exe = NtExecutable.createEmpty(false, false)
  const res = NtExecutableResource.from(exe)

  if (opts.withVersionInfo !== false) {
    const langs = opts.langs ?? [0x0409]
    const stringTables = langs.map(lang => ({ lang, codepage: 1200, values: { ProductName: "Original" } }))
    const versionInfo = Resource.VersionInfo.create(langs[0], {}, stringTables)
    versionInfo.outputToResourceEntries(res.entries)
  }

  if (opts.withManifest) {
    const xml =
      opts.manifestXml ??
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo></assembly>`
    const buf = Buffer.from(xml, "utf-8")
    res.entries.push({ type: 24, id: 1, lang: 0, codepage: 0, bin: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) })
  }

  res.outputResource(exe)
  return Buffer.from(exe.generate())
}

describe("editWindowsResources", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eb-resedit-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function writePe(buf: Buffer): Promise<string> {
    const file = path.join(tmpDir, `test-${Date.now()}.exe`)
    await fs.writeFile(file, buf)
    return file
  }

  const baseOpts: Omit<ResourceEditOptions, "file"> = {
    versionStrings: { FileDescription: "New App", ProductName: "New App", LegalCopyright: "© 2024" },
    fileVersion: "2.0.0.0",
    productVersion: "2.0.0.0",
  }

  test("updates version strings on exe with existing version info", async ({ expect }) => {
    const file = await writePe(makePeBuffer())
    await editWindowsResources({ ...baseOpts, file })
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("creates version info from scratch when none exists (mirrors rcedit)", async ({ expect }) => {
    const file = await writePe(makePeBuffer({ withVersionInfo: false }))
    await editWindowsResources({ ...baseOpts, file })
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("uses first language when multiple exist (mirrors rcedit)", async ({ expect }) => {
    const file = await writePe(makePeBuffer({ langs: [0x0409, 0x0407] }))
    await expect(editWindowsResources({ ...baseOpts, file })).resolves.toBeUndefined()
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("warns and skips when RT_MANIFEST is missing", async ({ expect }) => {
    const file = await writePe(makePeBuffer({ withManifest: false }))
    await expect(editWindowsResources({ ...baseOpts, file, requestedExecutionLevel: "requireAdministrator" })).resolves.toBeUndefined()
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("warns when requestedExecutionLevel node is absent from manifest xml", async ({ expect }) => {
    const noLevelXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"></assembly>`
    const file = await writePe(makePeBuffer({ withManifest: true, manifestXml: noLevelXml }))
    await editWindowsResources({ ...baseOpts, file, requestedExecutionLevel: "requireAdministrator" })
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("patches requestedExecutionLevel in manifest", async ({ expect }) => {
    const file = await writePe(makePeBuffer({ withManifest: true }))
    await editWindowsResources({ ...baseOpts, file, requestedExecutionLevel: "requireAdministrator" })
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("does not touch manifest when requestedExecutionLevel is asInvoker", async ({ expect }) => {
    const file = await writePe(makePeBuffer({ withManifest: true }))
    await editWindowsResources({ ...baseOpts, file, requestedExecutionLevel: "asInvoker" })
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })

  test("does not touch manifest when requestedExecutionLevel is omitted", async ({ expect }) => {
    const file = await writePe(makePeBuffer({ withManifest: true }))
    await editWindowsResources({ ...baseOpts, file })
    expect(readPeSnapshot(await fs.readFile(file))).toMatchSnapshot()
  })
})
