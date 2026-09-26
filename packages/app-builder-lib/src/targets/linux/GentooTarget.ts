import { Arch, defaultArchFromString, InvalidConfigurationError, log, toLinuxArchString } from "builder-util"
import _fsExtra from "fs-extra"
import * as path from "path"
import { Target } from "../../core.js"
import { LinuxPackager } from "../../linuxPackager.js"
import { GentooOptions } from "../../options/linuxOptions.js"
import { computeDownloadUrl, getPublishConfigs } from "../../publish/PublishManager.js"
import { computeForgeRawFileUrl, computeForgeReleaseBase, DetectedForge, detectForge } from "../../util/forgeReleaseUrl.js"
import { getGitUrlFromGitConfig } from "../../util/repositoryInfo.js"
import { shellQuote } from "./launcherScript.js"
import { installPrefix, LinuxTargetHelper, quoteDesktopExecPath } from "./LinuxTargetHelper.js"

const { copy, outputFile, pathExists, readdir } = _fsExtra

/** The archive targets whose output an ebuild can reference, in order of preference. */
const ARCHIVE_FORMATS = ["tar.gz", "tar.bz2", "tar.xz", "tar.lz"]

function toNodeArch(arch: Arch): string {
  switch (arch) {
    case Arch.x64:
      return "x64"
    case Arch.ia32:
      return "ia32"
    case Arch.armv7l:
      return "arm"
    case Arch.arm64:
      return "arm64"

    default:
      throw new Error(`Unsupported arch ${arch}`)
  }
}

/** The `<lang>.pak` files Electron ships, which `CHROMIUM_LANGS` has to mirror exactly. */
async function readLocalePakNames(localesDir: string): Promise<Array<string>> {
  try {
    return (await readdir(localesDir))
      .filter(it => it.endsWith(".pak"))
      .map(it => it.slice(0, -".pak".length))
      .sort()
  } catch {
    return []
  }
}

interface Distfile {
  readonly arch: Arch
  readonly gentooArch: string
  /** The directory the archive unpacks into, which becomes `S`. */
  readonly unpackDir: string
  readonly fileName: string
}

/** The app icon as a second SRC_URI entry; where it comes from is the developer's choice (`iconSource`). */
interface IconRef {
  /** `scalable` for svg, otherwise the pixel size, as `newicon -s` expects. */
  readonly size: string
  readonly ext: string
  /** The SRC_URI entry, with the literal version still in it; the macro is substituted on emit. */
  readonly uri: string
}

/**
 * We should license everything bundled inside an Electron runtime, mirroring what `www-client/chromium`
 * and `net-libs/nodejs` declares. Every Electron app redistributes these regardless of its own license.
 */
const ELECTRON_BUNDLED_LICENSES = [
  "Apache-2.0 Apache-2.0-with-LLVM-exceptions BSD BSD-2 Base64 Boost-1.0 CC-BY-3.0 CC-BY-4.0 Clear-BSD FFT2D FTL",
  "IJG ISC LGPL-2 LGPL-2.1 MIT MPL-1.1 MPL-2.0 Ms-PL PSF-2 SGI-B-2.0 SSLeay SunSoft Unicode-3.0",
  "Unicode-DFS-2015 Unlicense UoI-NCSA ZLIB libtiff openssl",
  "Apache-1.1 BlueOak-1.0.0",
]

/** The shared libraries an Electron binary lists in its ELF `NEEDED` entries, as Gentoo atoms. */
const DEFAULT_DEPENDS = [
  "app-accessibility/at-spi2-core:2",
  "dev-libs/expat",
  "dev-libs/glib:2",
  "dev-libs/nspr",
  "dev-libs/nss",
  "media-libs/alsa-lib",
  "media-libs/mesa",
  "net-print/cups",
  "sys-apps/dbus",
  "virtual/libudev",
  "x11-libs/cairo",
  "x11-libs/gtk+:3",
  "x11-libs/libX11",
  "x11-libs/libXcomposite",
  "x11-libs/libXdamage",
  "x11-libs/libXext",
  "x11-libs/libXfixes",
  "x11-libs/libXrandr",
  "x11-libs/libxcb",
  "x11-libs/libxkbcommon",
  "x11-libs/pango",
]

export default class GentooTarget extends Target {
  readonly options: GentooOptions = this.packager.getOptionsForTarget<GentooOptions>(this.name)

  private readonly distfiles: Array<Distfile> = []

  /** Locale pak basenames found in the staged tree, which become `CHROMIUM_LANGS`. in Gentoo */
  private chromiumLangs: Array<string> = []

  /** The `tar.*` target whose archive the ebuild references, or null when none was requested. */
  private readonly archiveFormat: string | null

  private repositoryUrl: string | null | undefined
  private forge: Promise<DetectedForge | null> | undefined

  constructor(
    name: string,
    private readonly packager: LinuxPackager,
    private readonly helper: LinuxTargetHelper,
    readonly outDir: string,
    requestedTargets: Array<string> = []
  ) {
    // Not async-supported, so every archive target has completed finishBuild() before ours runs.
    // That is what lets this target hash the archive it references.
    super(name, false)
    this.archiveFormat = ARCHIVE_FORMATS.find(it => requestedTargets.includes(it)) ?? null
  }

  private get packageName(): string {
    return this.options.packageName || `${this.packager.appInfo.linuxPackageName}-bin`
  }

  private get appDir(): string {
    return `${installPrefix}/${this.options.installDir || this.packager.appInfo.sanitizedProductName}`
  }

  async build(appOutDir: string, arch: Arch): Promise<any> {
    if (this.archiveFormat == null) {
      throw new InvalidConfigurationError(
        "The gentoo target references the archive your project publishes, but no tar archive target is enabled.\n" +
          `Add one of ${ARCHIVE_FORMATS.map(it => `"${it}"`).join(", ")} to linux.target alongside "gentoo".`
      )
    }

    this.chromiumLangs = await readLocalePakNames(path.join(appOutDir, "locales"))

    const fileName = this.resolveArchiveName(arch)
    this.distfiles.push({
      arch,
      gentooArch: toLinuxArchString(arch, this.name),
      // `tar()` names the archive's single top-level directory after the output file.
      unpackDir: path.basename(fileName, `.${this.archiveFormat}`),
      fileName,
    })
  }

  /**
   * Reproduces how ArchiveTarget names its output, so the ebuild points at the file the
   * archive target wrote and the Manifest digests the artifact that actually gets published.
   */
  private resolveArchiveName(arch: Arch): string {
    const packager = this.packager
    const format = this.archiveFormat!
    const defaultArch = defaultArchFromString(packager.platformOptions.defaultArch)
    // tslint:disable-next-line:no-invalid-template-strings
    const defaultPattern = "${name}-${version}" + (arch === defaultArch ? "" : "-${arch}") + ".${ext}"
    return packager.expandArtifactNamePattern((packager.config as any)[format], format, arch, defaultPattern, false)
  }

  /**
   * The icon is not inside the published archive and an ebuild cannot carry binary data, so it has
   * to be fetched from somewhere. Taht somewhere is the developer's call (`iconSource`). Whatever
   * the choice, this should never fails the build: if the source cannot provide the icon, the desktop entry
   * is emitted without one and the build warns.
   */
  private async resolveIcon(version: string, baseUrl: string): Promise<IconRef | null> {
    const source = this.options.iconSource ?? "repository"
    if (source === false) {
      return null
    }

    const candidates = await this.helper.icons
    const icon = candidates.find(it => it.file.endsWith(".svg")) ?? [...candidates].sort((a, b) => b.size - a.size)[0]
    if (icon == null) {
      log.warn({ reason: "no icon available" }, "gentoo: the desktop entry will have no icon")
      return null
    }
    const ext = path.extname(icon.file)
    const ref = { ext, size: ext === ".svg" ? "scalable" : `${icon.size}` }

    if (source === "asset") {
      const target = path.join(this.outDir, `${this.packageName}-${version}${ext}`)
      await copy(icon.file, target)
      const packager = this.packager
      await packager.emitArtifactBuildCompleted({ file: target, target: this, arch: null, packager, isWriteUpdateInfo: false })
      return { ...ref, uri: `${baseUrl}/\${P}${ext}` }
    }

    const relativePath = path.relative(this.packager.projectDir, icon.file)
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      log.warn(
        { reason: "the icon is not inside the project directory", file: icon.file, solution: 'set gentoo.iconSource to "asset"' },
        "gentoo: the desktop entry will have no icon"
      )
      return null
    }
    const detected = await this.resolveForge()
    if (detected == null) {
      log.warn(
        { reason: "the repository's forge could not be determined", solution: 'set gentoo.forge, or gentoo.iconSource to "asset"' },
        "gentoo: the desktop entry will have no icon"
      )
      return null
    }
    const url = computeForgeRawFileUrl(detected.forge, detected.remote, `v${this.packager.appInfo.version}`, relativePath.split(path.sep).join("/"))
    return { ...ref, uri: `${url} -> \${P}${ext}` }
  }

  async finishBuild(): Promise<any> {
    await super.finishBuild()

    if (this.distfiles.length === 0) {
      return
    }

    // ArchiveTarget queues its tar in build() and writes it in finishBuild(), and every async target
    // has completed finishBuild() by now. Checking here confirms the name predicted for SRC_URI is
    // the name the archive target actually produced.
    for (const it of this.distfiles) {
      if (!(await pathExists(path.join(this.outDir, it.fileName)))) {
        throw new Error(`The gentoo target expected the ${this.archiveFormat} target to have produced ${it.fileName}, but it is not in ${this.outDir}.`)
      }
    }

    // The ebuild is the whole delivery, published like all other artifacts.
    // whoever installs it runs `ebuild <file> manifest`, which digests the archive actually published,
    // so nothing shipped here can go stale.
    const packager = this.packager
    const version = this.helper.getSanitizedVersion(this.name)
    const baseUrl = await this.resolveDistUrl()
    const icon = await this.resolveIcon(version, baseUrl)
    const ebuildPath = path.join(this.outDir, `${this.packageName}-${version}.ebuild`)
    await outputFile(ebuildPath, await this.computeEbuild(icon, baseUrl))
    await packager.emitArtifactBuildCompleted({ file: ebuildPath, target: this, arch: null, packager, isWriteUpdateInfo: false })
  }

  private sortedDistfiles(): Array<Distfile> {
    return [...this.distfiles].sort((a, b) => a.gentooArch.localeCompare(b.gentooArch))
  }

  private computeSrcUri(versionMacro: string, icon: IconRef | null, baseUrl: string): string {
    const upstreamVersion = this.packager.appInfo.version
    const withMacro = (value: string) => value.split(upstreamVersion).join(versionMacro)
    const entries = this.sortedDistfiles().map(it => `\t${it.gentooArch}? ( ${withMacro(`${baseUrl}/${it.fileName}`)} )`)
    if (icon != null) {
      entries.push(`\t${withMacro(icon.uri)}`)
    }
    return entries.join("\n")
  }

  /**
   * The archive unpacks into a directory named after the file, which carries the Electron
   * architecture, so `S` cannot be a constant. It is set after unpack, when only the one fetched
   * archive is present.
   */
  private computeSrcUnpack(versionMacro: string): string {
    const upstreamVersion = this.packager.appInfo.version
    const cases = this.sortedDistfiles()
      .map(it => `\t\t${it.gentooArch}) S="\${WORKDIR}/${it.unpackDir.split(upstreamVersion).join(versionMacro)}" ;;`)
      .join("\n")
    return `\nsrc_unpack() {\n\tdefault\n\n\tcase \${ARCH} in\n${cases}\n\tesac\n}\n`
  }

  private async resolveDistUrl(): Promise<string> {
    const configured = this.options.distUrl
    if (configured != null) {
      return configured.replace(/\/+$/, "")
    }

    // A configured publish provider knows exactly where artifacts land, tag prefix and enterprise
    // host included. computeDownloadUrl throws for providers it cannot derive a URL for (gitlab,
    // keygen, bitbucket), and getPublishConfigs is null when `publish: null`; both fall through.
    const publishConfigs = await getPublishConfigs(this.packager, this.options, null, false)
    if (publishConfigs != null && publishConfigs.length > 0) {
      try {
        return computeDownloadUrl(publishConfigs[0], null, this.packager)
      } catch {
        // unsupported provider, use the repository field instead
      }
    }

    const detected = await this.resolveForge()
    if (detected == null) {
      throw new InvalidConfigurationError(
        "Cannot determine where the Gentoo distfiles will be published.\n" +
          (this.repositoryUrl == null
            ? 'package.json has no "repository" field and the project has no git remote named origin.\n'
            : `The host of ${this.repositoryUrl} is not a recognised forge and did not answer a Gitea or GitLab API probe.\n`) +
          'Set linux.gentoo.forge ("github", "gitlab" or "gitea") if it is one of those, otherwise set linux.gentoo.distUrl to the URL the archive will be downloadable from.'
      )
    }

    const base = computeForgeReleaseBase(detected.forge, detected.remote, `v${this.packager.appInfo.version}`)
    log.info({ forge: detected.forge, via: detected.via, base }, "gentoo: SRC_URI base")
    return base
  }

  /** Detected once and shared: the release URL and the icon's raw-file URL both hang off it. */
  private resolveForge(): Promise<DetectedForge | null> {
    if (this.forge == null) {
      this.forge = (async () => {
        this.repositoryUrl = await this.resolveRepositoryUrl()
        return this.repositoryUrl == null ? null : detectForge(this.repositoryUrl, this.options.forge, this.options.probeForge !== false)
      })()
    }
    return this.forge
  }

  private async resolveRepositoryUrl(): Promise<string | null> {
    const repository = this.packager.metadata.repository
    if (repository != null) {
      return typeof repository === "string" ? repository : repository.url
    }
    return getGitUrlFromGitConfig(this.packager.projectDir)
  }

  private expandDepends(): Array<string> {
    const configured = this.options.depends
    if (configured == null) {
      return DEFAULT_DEPENDS
    }
    const result: Array<string> = []
    for (const item of configured) {
      if (item === "default") {
        result.push(...DEFAULT_DEPENDS)
      } else {
        result.push(item)
      }
    }
    return Array.from(new Set(result))
  }

  /**
   * Scope the prebuilt-binary QA exemption to the app directory so we don't have to exempt the whole
   * image. `QA_PREBUILT` is a whitespace-separated list of globs, so a pkg / app name containing
   * spaces cannot be expressed and has to fall back to the blanket pattern.
   */
  private computeQaPrebuilt(): string {
    const appDir = this.appDir.substring(1)
    return /^[A-Za-z0-9._+\-/]+$/.test(appDir) ? `${appDir}/*` : "*"
  }

  /**
   * An Electron app ships a whole Chromium and Node.js inside it, so the app's own license is only
   * part of what is being distributed. This is cloned/mirrored the list `www-client/chromium` and `net-libs/nodejs`
   * carry, as the other Electron `-bin` packages in the tree do.
   */
  private computeBundledLicenses(): string {
    if (this.packager.framework.name !== "electron") {
      return ""
    }
    return "# Bundled Electron runtime, from www-client/chromium\n" + ELECTRON_BUNDLED_LICENSES.map(it => `LICENSE+=" ${it}"\n`).join("")
  }

  /**
   * Locale paks are pruned through `L10N`, and prebuildify ships a glibc and a musl build of each
   * native module side by side. Only one of which can load, and which one is only findable on
   * the machine doing the merge, unfortunately.
   */
  private computeSrcPrepare(isChromium: boolean): string {
    const body: Array<string> = ["\tdefault\n"]

    if (isChromium) {
      body.push(`\tcd locales || die\n\tchromium_remove_language_paks\n\tcd "\${S}" || die\n`)
    }
    if (this.options.pruneForeignPrebuilds !== false) {
      const nodeArchCases = this.sortedDistfiles()
        .map(it => `\t\t${it.gentooArch}) node_arch=${toNodeArch(it.arch)} ;;`)
        .join("\n")
      body.push(
        "\t# prebuildify ships a build per platform and per libc; only one can ever load here\n" +
          `\tlocal node_arch prebuilds\n\tcase \${ARCH} in\n${nodeArchCases}\n\tesac\n` +
          "\tfor prebuilds in resources/app.asar.unpacked/node_modules/*/prebuilds; do\n" +
          "\t\t[[ -d ${prebuilds} ]] || continue\n" +
          '\t\tfind "${prebuilds}" -mindepth 1 -maxdepth 1 -type d ! -name "linux-${node_arch}" -exec rm -r {} + || die\n' +
          "\tdone\n" +
          "\tif [[ ${CHOST} == *musl* ]]; then\n" +
          "\t\tfind . -name '*.glibc.node' -delete || die\n" +
          "\telse\n" +
          "\t\tfind . -name '*.musl.node' -delete || die\n" +
          "\tfi\n"
      )
    }

    if (body.length === 1) {
      return ""
    }
    return `\nsrc_prepare() {\n${body.join("\n")}}\n`
  }

  private computeKeywords(): Array<string> {
    const configured = this.options.keywords
    if (configured != null) {
      return configured
    }
    return ["-*", ...[...this.distfiles].map(it => `~${it.gentooArch}`).sort()]
  }

  private async computeEbuild(icon: IconRef | null, baseUrl: string): Promise<string> {
    const packager = this.packager
    const appInfo = packager.appInfo
    const executableName = packager.executableName
    const homepage = await appInfo.computePackageUrl()
    let license = this.options.license || packager.metadata.license
    if (license == null) {
      log.warn(
        { solution: 'add a "license" field to package.json, or set gentoo.license' },
        'gentoo: package.json declares no license, so the ebuild says LICENSE="all-rights-reserved"'
      )
      license = "all-rights-reserved"
    }
    const description = this.helper.getDescription(this.options) || appInfo.productName

    // Keep the version out of SRC_URI so a bump is a faster rename (easiest way). `PV` works only
    // when the ebuild version "survives" the semver mapping unchanged;
    // a prerelease such as 1.1.0-beta.1 becomes 1.1.0_beta1, so it needs the usual MY_PV indirection.
    const ebuildVersion = this.helper.getSanitizedVersion(this.name)
    const usesPv = ebuildVersion === appInfo.version
    const versionMacro = usesPv ? "${PV}" : "${MY_PV}"
    const myPv = usesPv ? "" : `MY_PV="${escapeEbuildString(appInfo.version)}"\n`

    const isChromium = this.chromiumLangs.length > 0
    const eclasses = ["desktop", "pax-utils", "xdg"]
    let langs = ""
    if (isChromium) {
      eclasses.unshift("chromium-2")
      langs = `CHROMIUM_LANGS="\n${wrapWords(this.chromiumLangs, "\t")}\n"\n\n`
    }

    // /usr/bin/<app> is a root-owned bash launcher that accepts developer and user
    // user extra arguments
    const binary = `${this.appDir}/${executableName}`
    const executableArgs = this.options.executableArgs ?? []
    const launcherBody = ["#!/usr/bin/env bash", "declare -a params"]
    if (executableArgs.length > 0) {
      launcherBody.push(`params+=( ${executableArgs.map(shellQuote).join(" ")} )`)
    }
    launcherBody.push(`exec ${shellQuote(binary)} "\${params[@]}" "$@"`)
    const launcherLines =
      `\tcat > "\${T}"/${executableName} <<-'EOF' || die\n` +
      indentHeredoc(launcherBody.join("\n")) +
      `\n\tEOF\n\texeinto /usr/bin\n\tnewexe "\${T}"/${executableName} ${executableName}`

    const desktopExec = `${quoteDesktopExecPath(`/usr/bin/${executableName}`)} %U`
    const desktopLines =
      `\tcat > "\${T}"/${executableName}.desktop <<-'EOF' || die\n` +
      indentHeredoc(await this.helper.computeDesktopEntry(this.options, desktopExec)) +
      `\n\tEOF\n\tdomenu "\${T}"/${executableName}.desktop`

    const iconInstall = icon == null ? "" : `\n\tnewicon -s ${icon.size} "\${DISTDIR}"/\${P}${icon.ext} ${executableName}${icon.ext}`

    return `# Copyright ${new Date().getFullYear()} Gentoo Authors
# Distributed under the terms of the GNU General Public License v2

EAPI=${this.options.eapi ?? 8}

${langs}inherit ${eclasses.join(" ")}

DESCRIPTION="${escapeEbuildString(description)}"
HOMEPAGE="${escapeEbuildString(homepage ?? "")}"
${myPv}SRC_URI="
${this.computeSrcUri(versionMacro, icon, baseUrl)}
"

LICENSE="${escapeEbuildString(license)}"
${this.computeBundledLicenses()}SLOT="0"
KEYWORDS="${this.computeKeywords().join(" ")}"
RESTRICT="strip"

RDEPEND="
${this.expandDepends()
  .map(it => `\t${it}`)
  .join("\n")}
"

QA_PREBUILT=${shellQuote(this.computeQaPrebuilt())}
${this.computeSrcUnpack(versionMacro)}${this.computeSrcPrepare(isChromium)}${
      isChromium
        ? `
src_configure() {
\tdefault

\tchromium_suid_sandbox_check_kernel_config
}
`
        : ""
    }
src_install() {
\tlocal app_root=${shellQuote(this.appDir)}

\t# cp -a, not doins: the archive already carries the right modes, and doins would strip the
\t# executable bit from every bundled binary and shared library.
\tdodir "\${app_root}"
\tcp -a . "\${ED}\${app_root}"/ || die

\t# Electron ships a SUID sandbox helper, used when the kernel denies unprivileged user namespaces.
\tif [[ -e chrome-sandbox ]]; then
\t\tfperms 4711 "\${app_root}"/chrome-sandbox
\tfi

\t# Chromium needs writable+executable memory, which a PaX-enabled kernel denies by default.
\tpax-mark m "\${ED}\${app_root}"/${executableName}

${launcherLines}

${desktopLines}${iconInstall}
}
`
  }
}

/** Body lines for a `<<-'EOF'` heredoc: two tabs, which `<<-` strips, so the written file is flush left. */
function indentHeredoc(content: string): string {
  return content
    .trimEnd()
    .split("\n")
    .map(it => `\t\t${it}`)
    .join("\n")
}

/** Escape a value for interpolation into a double-quoted ebuild metadata string. */
function escapeEbuildString(value: string): string {
  return value.replace(/([\\"$`])/g, "\\$1")
}

/** Wrap a long list across lines so the generated ebuild stays readable. */
function wrapWords(words: Array<string>, indent: string, width = 110): string {
  const lines: Array<string> = []
  let current = indent
  for (const word of words) {
    if (current !== indent && current.length + 1 + word.length > width) {
      lines.push(current)
      current = indent
    }
    current += current === indent ? word : ` ${word}`
  }
  if (current !== indent) {
    lines.push(current)
  }
  return lines.join("\n")
}
