import { path7za } from "7zip-bin"
import { Arch, debug, exec, log, spawn, isEmptyOrSpaces } from "builder-util"
import { copyFile, walk } from "builder-util/out/fs"
import { compute7zCompressArgs } from "app-builder-lib/out/targets/archive"
import { execWine, prepareWindowsExecutableArgs as prepareArgs } from "app-builder-lib/out/wine"
import { WinPackager } from "app-builder-lib/out/winPackager"
import { createWriteStream, stat, unlink, writeFile } from "fs-extra"
import * as path from "path"
import * as archiver from "archiver"
import * as fs from "fs/promises"

export function convertVersion(version: string): string {
  const parts = version.split("-")
  const mainVersion = parts.shift()
  if (parts.length > 0) {
    return [mainVersion, parts.join("-").replace(/\./g, "")].join("-")
  } else {
    return mainVersion!
  }
}

function syncReleases(outputDirectory: string, options: SquirrelOptions) {
  log.info("syncing releases to build delta package")
  const args = prepareArgs(["-u", options.remoteReleases!, "-r", outputDirectory], path.join(options.vendorPath, "SyncReleases.exe"))
  if (options.remoteToken) {
    args.push("-t", options.remoteToken)
  }
  return spawn(process.platform === "win32" ? path.join(options.vendorPath, "SyncReleases.exe") : "mono", args)
}

export interface SquirrelOptions {
  vendorPath: string
  remoteReleases?: string
  remoteToken?: string
  loadingGif?: string
  productName: string
  appId?: string
  name: string
  packageCompressionLevel?: number
  version: string
  msi?: any

  description?: string
  iconUrl?: string
  authors?: string
  extraMetadataSpecs?: string
  copyright?: string
}

export interface OutFileNames {
  setupFile: string
  packageFile: string
}

export class SquirrelBuilder {
  constructor(private readonly options: SquirrelOptions, private readonly outputDirectory: string, private readonly packager: WinPackager) {}

  async buildInstaller(outFileNames: OutFileNames, appOutDir: string, outDir: string, arch: Arch) {
    const packager = this.packager
    const dirToArchive = await packager.info.tempDirManager.createTempDir({ prefix: "squirrel-windows" })
    const outputDirectory = this.outputDirectory
    const options = this.options
    const appUpdate = path.join(dirToArchive, "Update.exe")
    await Promise.all([
      copyFile(path.join(options.vendorPath, "Update.exe"), appUpdate).then(() => packager.sign(appUpdate)),
      Promise.all([
        fs.rm(`${outputDirectory.replace(/\\/g, "/")}/*-full.nupkg`, { recursive: true, force: true }),
        fs.rm(path.join(outputDirectory, "RELEASES"), { recursive: true, force: true }),
      ]).then(() => fs.mkdir(outputDirectory, { recursive: true })),
    ])

    if (isEmptyOrSpaces(options.description)) {
      options.description = options.productName
    }

    if (options.remoteReleases) {
      await syncReleases(outputDirectory, options)
    }

    const version = convertVersion(options.version)
    const nupkgPath = path.join(outputDirectory, outFileNames.packageFile)
    const setupPath = path.join(outputDirectory, outFileNames.setupFile)

    await Promise.all<any>([
      pack(options, appOutDir, appUpdate, nupkgPath, version, packager),
      copyFile(path.join(options.vendorPath, "Setup.exe"), setupPath),
      copyFile(
        options.loadingGif ? path.resolve(packager.projectDir, options.loadingGif) : path.join(options.vendorPath, "install-spinner.gif"),
        path.join(dirToArchive, "background.gif")
      ),
    ])

    // releasify can be called only after pack nupkg and nupkg must be in the final output directory (where other old version nupkg can be located)
    await this.releasify(nupkgPath, outFileNames.packageFile).then(it => writeFile(path.join(dirToArchive, "RELEASES"), it))

    const embeddedArchiveFile = await this.createEmbeddedArchiveFile(nupkgPath, dirToArchive)

    await execWine(path.join(options.vendorPath, "WriteZipToSetup.exe"), null, [setupPath, embeddedArchiveFile])

    await packager.signAndEditResources(setupPath, arch, outDir)
    if (options.msi && process.platform === "win32") {
      const outFile = outFileNames.setupFile.replace(".exe", ".msi")
      await msi(options, nupkgPath, setupPath, outputDirectory, outFile)
      // rcedit can only edit .exe resources
      await packager.sign(path.join(outputDirectory, outFile))
    }
  }

  private async releasify(nupkgPath: string, packageName: string) {
    const args = ["--releasify", nupkgPath, "--releaseDir", this.outputDirectory]
    const out = (await execSw(this.options, args)).trim()
    if (debug.enabled) {
      debug(`Squirrel output: ${out}`)
    }

    const lines = out.split("\n")
    for (let i = lines.length - 1; i > -1; i--) {
      const line = lines[i]
      if (line.includes(packageName)) {
        return line.trim()
      }
    }

    throw new Error(`Invalid output, cannot find last release entry, output: ${out}`)
  }

  private async createEmbeddedArchiveFile(nupkgPath: string, dirToArchive: string) {
    const embeddedArchiveFile = await this.packager.getTempFile("setup.zip")
    await exec(
      path7za,
      compute7zCompressArgs("zip", {
        isRegularFile: true,
        compression: this.packager.compression,
      }).concat(embeddedArchiveFile, "."),
      {
        cwd: dirToArchive,
      }
    )
    await exec(
      path7za,
      compute7zCompressArgs("zip", {
        isRegularFile: true,
        compression: "store" /* nupkg is already compressed */,
      }).concat(embeddedArchiveFile, nupkgPath)
    )
    return embeddedArchiveFile
  }
}

async function pack(options: SquirrelOptions, directory: string, updateFile: string, outFile: string, version: string, packager: WinPackager) {
  // SW now doesn't support 0-level nupkg compressed files. It means that we are forced to use level 1 if store level requested.
  const archive = archiver("zip", { zlib: { level: Math.max(1, options.packageCompressionLevel == null ? 9 : options.packageCompressionLevel) } })
  const archiveOut = createWriteStream(outFile)
  const archivePromise = new Promise((resolve, reject) => {
    archive.on("error", reject)
    archiveOut.on("error", reject)
    archiveOut.on("close", resolve)
  })
  archive.pipe(archiveOut)

  const author = options.authors
  const copyright = options.copyright || `Copyright © ${new Date().getFullYear()} ${author}`
  const nuspecContent = `<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${options.appId}</id>
    <version>${version}</version>
    <title>${options.productName}</title>
    <authors>${author}</authors>
    <iconUrl>${options.iconUrl}</iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>${options.description}</description>
    <copyright>${copyright}</copyright>${options.extraMetadataSpecs || ""}
  </metadata>
</package>`
  debug(`Created NuSpec file:\n${nuspecContent}`)
  archive.append(nuspecContent.replace(/\n/, "\r\n"), { name: `${options.name}.nuspec` })

  //noinspection SpellCheckingInspection
  archive.append(
    `<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/${options.name}.nuspec" Id="Re0" />
  <Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="/package/services/metadata/core-properties/1.psmdcp" Id="Re1" />
</Relationships>`.replace(/\n/, "\r\n"),
    { name: ".rels", prefix: "_rels" }
  )

  //noinspection SpellCheckingInspection
  archive.append(
    `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="nuspec" ContentType="application/octet" />
  <Default Extension="pak" ContentType="application/octet" />
  <Default Extension="asar" ContentType="application/octet" />
  <Default Extension="bin" ContentType="application/octet" />
  <Default Extension="dll" ContentType="application/octet" />
  <Default Extension="exe" ContentType="application/octet" />
  <Default Extension="dat" ContentType="application/octet" />
  <Default Extension="psmdcp" ContentType="application/vnd.openxmlformats-package.core-properties+xml" />
  <Default Extension="diff" ContentType="application/octet" />
  <Default Extension="bsdiff" ContentType="application/octet" />
  <Default Extension="shasum" ContentType="text/plain" />
  <Default Extension="mp3" ContentType="audio/mpeg" />
  <Default Extension="node" ContentType="application/octet" />
</Types>`.replace(/\n/, "\r\n"),
    { name: "[Content_Types].xml" }
  )

  archive.append(
    `<?xml version="1.0" encoding="utf-8"?>
<coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
  <dc:creator>${author}</dc:creator>
  <dc:description>${options.description}</dc:description>
  <dc:identifier>${options.appId}</dc:identifier>
  <version>${version}</version>
  <keywords/>
  <dc:title>${options.productName}</dc:title>
  <lastModifiedBy>NuGet, Version=2.8.50926.602, Culture=neutral, PublicKeyToken=null;Microsoft Windows NT 6.2.9200.0;.NET Framework 4</lastModifiedBy>
</coreProperties>`.replace(/\n/, "\r\n"),
    { name: "1.psmdcp", prefix: "package/services/metadata/core-properties" }
  )

  archive.file(updateFile, { name: "Update.exe", prefix: "lib/net45" })
  await encodedZip(archive, directory, "lib/net45", options.vendorPath, packager)
  await archivePromise
}

function execSw(options: SquirrelOptions, args: Array<string>) {
  return exec(process.platform === "win32" ? path.join(options.vendorPath, "Update.com") : "mono", prepareArgs(args, path.join(options.vendorPath, "Update-Mono.exe")), {
    env: {
      ...process.env,
      SZA_PATH: path7za,
    },
  })
}

async function msi(options: SquirrelOptions, nupkgPath: string, setupPath: string, outputDirectory: string, outFile: string) {
  const args = ["--createMsi", nupkgPath, "--bootstrapperExe", setupPath]
  await execSw(options, args)
  //noinspection SpellCheckingInspection
  await exec(path.join(options.vendorPath, "candle.exe"), ["-nologo", "-ext", "WixNetFxExtension", "-out", "Setup.wixobj", "Setup.wxs"], {
    cwd: outputDirectory,
  })
  //noinspection SpellCheckingInspection
  await exec(path.join(options.vendorPath, "light.exe"), ["-ext", "WixNetFxExtension", "-sval", "-out", outFile, "Setup.wixobj"], {
    cwd: outputDirectory,
  })

  //noinspection SpellCheckingInspection
  await Promise.all([
    unlink(path.join(outputDirectory, "Setup.wxs")),
    unlink(path.join(outputDirectory, "Setup.wixobj")),
    unlink(path.join(outputDirectory, outFile.replace(".msi", ".wixpdb"))).catch(e => debug(e.toString())),
  ])
}

async function encodedZip(archive: any, dir: string, prefix: string, vendorPath: string, packager: WinPackager) {
  await walk(dir, null, {
    isIncludeDir: true,
    consume: async (file, stats) => {
      if (stats.isDirectory()) {
        return
      }

      const relativeSafeFilePath = file.substring(dir.length + 1).replace(/\\/g, "/")
      archive._append(file, {
        name: relativeSafeFilePath,
        prefix,
        stats,
      })

      // createExecutableStubForExe
      // https://github.com/Squirrel/Squirrel.Windows/pull/1051 Only generate execution stubs for the top-level executables
      if (file.endsWith(".exe") && !file.includes("squirrel.exe") && !relativeSafeFilePath.includes("/")) {
        const tempFile = await packager.getTempFile("stub.exe")
        await copyFile(path.join(vendorPath, "StubExecutable.exe"), tempFile)
        await execWine(path.join(vendorPath, "WriteZipToSetup.exe"), null, ["--copy-stub-resources", file, tempFile])
        await packager.sign(tempFile)

        archive._append(tempFile, {
          name: relativeSafeFilePath.substring(0, relativeSafeFilePath.length - 4) + "_ExecutionStub.exe",
          prefix,
          stats: await stat(tempFile),
        })
      }
    },
  })
  archive.finalize()
}
