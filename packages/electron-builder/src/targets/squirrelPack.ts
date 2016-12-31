import * as path from "path"
import BluebirdPromise from "bluebird-lst-c"
import { remove, copy, createWriteStream, unlink, ensureDir, stat } from "fs-extra-p"
import { spawn, exec, prepareArgs, execWine, debug } from "../util/util"
import { WinPackager } from "../winPackager"
import { log } from "../util/log"
import { walk, copyFile } from "../util/fs"

const archiver = require("archiver")

export function convertVersion(version: string): string {
  const parts = version.split("-")
  const mainVersion = parts.shift()
  if (parts.length > 0) {
    return [mainVersion, parts.join("-").replace(/\./g, "")].join("-")
  }
  else {
    return mainVersion!
  }
}

function syncReleases(outputDirectory: string, options: SquirrelOptions) {
  log("Sync releases to build delta package")
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
  productName?: string
  appId?: string
  name: string
  packageCompressionLevel?: number
  version: string
  msi?: any

  owners?: string
  description?: string
  iconUrl?: string
  authors?: string
  extraMetadataSpecs?: string
  copyright?: string
}

export async function buildInstaller(options: SquirrelOptions, outputDirectory: string, setupExe: string, packager: WinPackager, appOutDir: string) {
  const appUpdate = await packager.getTempFile("Update.exe")
  await BluebirdPromise.all([
    copy(path.join(options.vendorPath, "Update.exe"), appUpdate)
      .then(() => packager.sign(appUpdate)),
    BluebirdPromise.all([remove(`${outputDirectory.replace(/\\/g, "/")}/*-full.nupkg`), remove(path.join(outputDirectory, "RELEASES"))])
      .then(() => ensureDir(outputDirectory))
  ])

  if (options.remoteReleases) {
    await syncReleases(outputDirectory, options)
  }

  const embeddedArchiveFile = await packager.getTempFile("setup.zip")
  const embeddedArchive = archiver("zip", {zlib: {level: options.packageCompressionLevel == null ? 6 : options.packageCompressionLevel}})
  const embeddedArchiveOut = createWriteStream(embeddedArchiveFile)
  const embeddedArchivePromise = new BluebirdPromise(function (resolve, reject) {
    embeddedArchive.on("error", reject)
    embeddedArchiveOut.on("close", resolve)
  })
  embeddedArchive.pipe(embeddedArchiveOut)

  embeddedArchive.file(appUpdate, {name: "Update.exe"})
  embeddedArchive.file(options.loadingGif ? path.resolve(options.loadingGif) : path.join(__dirname, "..", "..", "templates", "install-spinner.gif"), {name: "background.gif"})

  const version = convertVersion(options.version)
  const packageName = `${options.name}-${version}-full.nupkg`
  const nupkgPath = path.join(outputDirectory, packageName)
  const setupPath = path.join(outputDirectory, setupExe || `${options.name || options.productName}Setup.exe`)

  await BluebirdPromise.all<any>([
    pack(options, appOutDir, appUpdate, nupkgPath, version, packager),
    copy(path.join(options.vendorPath, "Setup.exe"), setupPath),
  ])

  embeddedArchive.file(nupkgPath, {name: packageName})

  const releaseEntry = await releasify(options, nupkgPath, outputDirectory, packageName)

  embeddedArchive.append(releaseEntry, {name: "RELEASES"})
  embeddedArchive.finalize()
  await embeddedArchivePromise

  await execWine(path.join(options.vendorPath, "WriteZipToSetup.exe"), [setupPath, embeddedArchiveFile])

  await packager.signAndEditResources(setupPath)
  if (options.msi && process.platform === "win32") {
    const outFile = setupExe.replace(".exe", ".msi")
    await msi(options, nupkgPath, setupPath, outputDirectory, outFile)
    // rcedit can only edit .exe resources
    await packager.sign(path.join(outputDirectory, outFile))
  }
}

async function pack(options: SquirrelOptions, directory: string, updateFile: string, outFile: string, version: string, packager: WinPackager) {
  const archive = archiver("zip", {zlib: {level: options.packageCompressionLevel == null ? 9 : options.packageCompressionLevel}})
  const archiveOut = createWriteStream(outFile)
  const archivePromise = new BluebirdPromise(function (resolve, reject) {
    archive.on("error", reject)
    archiveOut.on("error", reject)
    archiveOut.on("close", resolve)
  })
  archive.pipe(archiveOut)

  const author = options.authors || options.owners
  const copyright = options.copyright || `Copyright © ${new Date().getFullYear()} ${author}`
  const nuspecContent = `<?xml version="1.0"?>
<package xmlns="http://schemas.microsoft.com/packaging/2011/08/nuspec.xsd">
  <metadata>
    <id>${options.appId}</id>
    <version>${version}</version>
    <title>${options.productName}</title>
    <authors>${author}</authors>
    <owners>${options.owners || options.authors}</owners>
    <iconUrl>${options.iconUrl}</iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>${options.description}</description>
    <copyright>${copyright}</copyright>${options.extraMetadataSpecs || ""}
  </metadata>
</package>`
  debug(`Created NuSpec file:\n${nuspecContent}`)
  archive.append(nuspecContent.replace(/\n/, "\r\n"), {name: `${encodeURI(options.name).replace(/%5B/g, "[").replace(/%5D/g, "]")}.nuspec`})

  //noinspection SpellCheckingInspection
  archive.append(`<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/${options.name}.nuspec" Id="Re0" />
  <Relationship Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="/package/services/metadata/core-properties/1.psmdcp" Id="Re1" />
</Relationships>`.replace(/\n/, "\r\n"), {name: ".rels", prefix: "_rels"})

  //noinspection SpellCheckingInspection
  archive.append(`<?xml version="1.0" encoding="utf-8"?>
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
</Types>`.replace(/\n/, "\r\n"), {name: "[Content_Types].xml"})

  archive.append(`<?xml version="1.0" encoding="utf-8"?>
<coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties">
  <dc:creator>${author}</dc:creator>
  <dc:description>${options.description}</dc:description>
  <dc:identifier>${options.appId}</dc:identifier>
  <version>${version}</version>
  <keywords/>
  <dc:title>${options.productName}</dc:title>
  <lastModifiedBy>NuGet, Version=2.8.50926.602, Culture=neutral, PublicKeyToken=null;Microsoft Windows NT 6.2.9200.0;.NET Framework 4</lastModifiedBy>
</coreProperties>`.replace(/\n/, "\r\n"), {name: "1.psmdcp", prefix: "package/services/metadata/core-properties"})

  archive.file(updateFile, {name: "Update.exe", prefix: "lib/net45"})
  await encodedZip(archive, directory, "lib/net45", options.vendorPath, packager)
  await archivePromise
}

async function releasify(options: SquirrelOptions, nupkgPath: string, outputDirectory: string, packageName: string) {
  const args = [
    "--releasify", nupkgPath,
    "--releaseDir", outputDirectory
  ]
  const out = (await exec(process.platform === "win32" ? path.join(options.vendorPath, "Update.com") : "mono", prepareArgs(args, path.join(options.vendorPath, "Update-Mono.exe")), {
    maxBuffer: 4 * 1024000,
  })).trim()
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

async function msi(options: SquirrelOptions, nupkgPath: string, setupPath: string, outputDirectory: string, outFile: string) {
  const args = [
    "--createMsi", nupkgPath,
    "--bootstrapperExe", setupPath
  ]
  await exec(process.platform === "win32" ? path.join(options.vendorPath, "Update.com") : "mono", prepareArgs(args, path.join(options.vendorPath, "Update-Mono.exe")))
  //noinspection SpellCheckingInspection
  await exec(path.join(options.vendorPath, "candle.exe"), ["-nologo", "-ext", "WixNetFxExtension", "-out", "Setup.wixobj", "Setup.wxs"], {
    cwd: outputDirectory,
  })
  //noinspection SpellCheckingInspection
  await exec(path.join(options.vendorPath, "light.exe"), ["-ext", "WixNetFxExtension", "-sval", "-out", outFile, "Setup.wixobj"], {
    cwd: outputDirectory,
  })

  //noinspection SpellCheckingInspection
  await BluebirdPromise.all([
    unlink(path.join(outputDirectory, "Setup.wxs")),
    unlink(path.join(outputDirectory, "Setup.wixobj")),
    unlink(path.join(outputDirectory, outFile.replace(".msi", ".wixpdb"))).catch(e => debug(e.toString())),
  ])
}

async function encodedZip(archive: any, dir: string, prefix: string, vendorPath: string, packager: WinPackager) {
  await walk(dir, null, async (file, stats) => {
    if (stats.isDirectory()) {
      return
    }

    // GBK file name encoding (or Non-English file name) caused a problem
    const relativeSafeFilePath = encodeURI(file.substring(dir.length + 1).replace(/\\/g, "/")).replace(/%5B/g, "[").replace(/%5D/g, "]")
    archive._append(file, {
      name: relativeSafeFilePath,
      prefix: prefix,
      stats: stats,
    })

    // createExecutableStubForExe
    if (file.endsWith(".exe") && !file.includes("squirrel.exe")) {
      const tempFile = await packager.getTempFile("stub.exe")
      await copyFile(path.join(vendorPath, "StubExecutable.exe"), tempFile, null, false)
      await execWine(path.join(vendorPath, "WriteZipToSetup.exe"), ["--copy-stub-resources", file, tempFile])

      archive._append(tempFile, {
        name: relativeSafeFilePath.substring(0, relativeSafeFilePath.length - 4) + "_ExecutionStub.exe",
        prefix: prefix,
        stats: await stat(tempFile),
      })
    }
  })
  archive.finalize()
}