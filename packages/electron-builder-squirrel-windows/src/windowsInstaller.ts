import { exec, log } from "builder-util"
import * as fs from "fs/promises"
import * as path from "path"

export function convertVersion(version: string): string {
  const parts = version.split("+")[0].split("-")
  const mainVersion = parts.shift()
  return parts.length > 0 ? [mainVersion, parts.join("-").replace(/\./g, "")].join("-") : mainVersion!
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

export function renderNuspecTemplate(templateContent: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.split(`<%- ${k} %>`).join(v), templateContent)
}

export async function buildAdditionalFilesXml(appDirectory: string): Promise<string> {
  const checks: Array<{ rel: string; src: string; target: string }> = [
    { rel: "swiftshader", src: "swiftshader\\**", target: "lib\\net45\\swiftshader" },
    { rel: "vk_swiftshader_icd.json", src: "vk_swiftshader_icd.json", target: "lib\\net45" },
  ]
  const lines: string[] = []
  for (const { rel, src, target } of checks) {
    try {
      await fs.access(path.join(appDirectory, rel))
      lines.push(`    <file src="${src}" target="${target}" />`)
    } catch {
      // not present, skip
    }
  }
  return lines.join("\n")
}

export interface InstallerOptions {
  appDirectory: string
  outputDirectory: string
  vendorDirectory: string
  name: string
  title?: string | null
  version: string
  description?: string | null
  exe: string
  authors: string
  owners?: string | null
  iconUrl?: string | null
  copyright?: string | null
  nuspecTemplate: string
  loadingGif?: string | null
  noMsi?: boolean
  remoteReleases?: string | null
  remoteToken?: string | null
  setupExe?: string | null
  setupMsi?: string | null
  fixUpPaths?: boolean
  createTempDir: (options: { prefix: string }) => Promise<string>
}

export async function createWindowsInstaller(options: InstallerOptions): Promise<void> {
  const { appDirectory, outputDirectory, vendorDirectory, name, version, exe, nuspecTemplate, loadingGif, noMsi, remoteReleases, remoteToken, setupExe, setupMsi, fixUpPaths = false, createTempDir } = options

  const useMono = process.platform !== "win32"
  if (useMono) {
    log.warn("building Squirrel.Windows on non-Windows requires mono in PATH; spawn will fail if it is missing")
  }

  // Squirrel.exe must live in the app directory so the nuspec can reference it
  await fs.copyFile(path.join(vendorDirectory, "Squirrel.exe"), path.join(appDirectory, "Squirrel.exe"))

  const nugetVersion = convertVersion(version)
  const authors = options.authors || ""
  const copyright = options.copyright || `Copyright © ${new Date().getFullYear()} ${authors}`
  const owners = options.owners || authors
  const additionalFilesXml = await buildAdditionalFilesXml(appDirectory)

  let templateContent = await fs.readFile(nuspecTemplate, "utf8")
  if (path.sep === "/") {
    templateContent = templateContent.replace(/\\/g, "/")
  }

  const nuspecContent = renderNuspecTemplate(templateContent, {
    name: escapeXml(name),
    title: escapeXml(options.title || name),
    version: escapeXml(nugetVersion),
    authors: escapeXml(authors),
    owners: escapeXml(owners),
    iconUrl: escapeXml(options.iconUrl || ""),
    description: escapeXml(options.description || options.title || name),
    copyright: escapeXml(copyright),
    exe: escapeXml(exe),
    additionalFilesXml,
  })

  const nugetOutput = await createTempDir({ prefix: "squirrel-nuget-" })
  const nuspecPath = path.join(nugetOutput, `${name}.nuspec`)
  await fs.writeFile(nuspecPath, nuspecContent)

  const nugetExe = path.join(vendorDirectory, "nuget.exe")
  const nugetArgs = ["pack", nuspecPath, "-BasePath", appDirectory, "-OutputDirectory", nugetOutput, "-NoDefaultExcludes"]
  await (useMono ? exec("mono", [nugetExe, ...nugetArgs]) : exec(nugetExe, nugetArgs))

  const nupkgPath = path.join(nugetOutput, `${name}.${nugetVersion}.nupkg`)

  if (remoteReleases) {
    const syncReleasesExe = path.join(vendorDirectory, "SyncReleases.exe")
    const syncArgs = ["-u", remoteReleases, "-r", outputDirectory]
    if (remoteToken) {
      syncArgs.push("-t", remoteToken)
    }
    await (useMono ? exec("mono", [syncReleasesExe, ...syncArgs]) : exec(syncReleasesExe, syncArgs))
  }

  const releasifyArgs = ["--releasify", nupkgPath, "--releaseDir", outputDirectory]
  if (loadingGif) {
    releasifyArgs.push("--loadingGif", loadingGif)
  }
  if (noMsi) {
    releasifyArgs.push("--no-msi")
  }

  if (useMono) {
    await exec("mono", [path.join(vendorDirectory, "Squirrel-Mono.exe"), ...releasifyArgs])
  } else {
    await exec(path.join(vendorDirectory, "Squirrel.exe"), releasifyArgs)
  }

  if (fixUpPaths) {
    if (setupExe) {
      await fs.rename(path.join(outputDirectory, "Setup.exe"), path.join(outputDirectory, setupExe))
    }
    if (setupMsi) {
      try {
        await fs.rename(path.join(outputDirectory, "Setup.msi"), path.join(outputDirectory, setupMsi))
      } catch {
        // Setup.msi won't exist when noMsi is true
      }
    }
  }
}
