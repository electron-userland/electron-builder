import { Arch, LinuxPackager, Packager, Platform, PlatformPackager, Target } from "app-builder-lib"
import { outputFile, outputJson, readFile, writeFile } from "fs-extra"
import * as path from "path"

// The pkg target writes distribution.xml, emits pkgDistributionCreated, then hands the file to productbuild. productbuild
// only exists on macOS, so a stand-in target does the same steps here and reads back what productbuild would get.
class DistributionWritingTarget extends Target {
  readonly options = null
  distribution: string | undefined

  constructor(
    readonly outDir: string,
    private readonly packager: PlatformPackager<any>
  ) {
    super("pkg-stand-in")
  }

  async build(): Promise<any> {
    const distInfoFile = path.join(this.outDir, "distribution.xml")
    await outputFile(distInfoFile, '<?xml version="1.0" encoding="utf-8"?>\n<installer-gui-script minSpecVersion="2">\n</installer-gui-script>\n')
    await this.packager.emitPkgDistributionCreated(distInfoFile)
    this.distribution = await readFile(distInfoFile, "utf-8")
  }
}

async function buildWithHook(tmpDir: any, pkgDistributionCreated: ((file: string) => Promise<void>) | null): Promise<DistributionWritingTarget> {
  const projectDir = await tmpDir.getTempDir({ prefix: "pkg-hook-project" })
  await outputJson(path.join(projectDir, "package.json"), { name: "pkg-hook-app", version: "1.0.0", description: "test", author: "Foo Bar <foo@example.com>" })
  const prepackaged = await tmpDir.getTempDir({ prefix: "pkg-hook-prepackaged" })
  await outputFile(path.join(prepackaged, "resources", "app.asar"), "")

  let target: DistributionWritingTarget | undefined
  class StandInPackager extends LinuxPackager {
    createTargets(targets: Array<string>, mapper: (name: string, factory: (outDir: string) => Target) => void): void {
      for (const name of targets) {
        mapper(name, outDir => (target = new DistributionWritingTarget(outDir, this)))
      }
    }
  }
  const packager = new Packager({
    projectDir,
    prepackaged,
    targets: new Map([[Platform.LINUX, new Map([[Arch.x64, ["dir"]]])]]),
    config: { electronVersion: "38.0.0", directories: { output: path.join(projectDir, "dist") }, pkgDistributionCreated },
    platformPackagerFactory: info => new StandInPackager(info),
  })
  await packager.build()
  return target!
}

test("pkgDistributionCreated receives the distribution file before it is used, and can rewrite it", async ({ expect, tmpDir }) => {
  const received: Array<string> = []
  const target = await buildWithHook(tmpDir, async file => {
    received.push(file)
    const xml = await readFile(file, "utf-8")
    await writeFile(file, xml.replace("</installer-gui-script>", "    <title>Custom Title</title>\n</installer-gui-script>"))
  })
  expect(received).toEqual([path.join(target.outDir, "distribution.xml")])
  expect(target.distribution).toContain("<title>Custom Title</title>")
})

test("without pkgDistributionCreated the distribution file is used as written", async ({ expect, tmpDir }) => {
  const target = await buildWithHook(tmpDir, null)
  expect(target.distribution).not.toContain("<title>")
})
