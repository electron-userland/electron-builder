import { InvalidConfigurationError } from "builder-util"
import { WindowsHsmSigningConfig } from "../options/winOptions"
import { VmManager } from "../vm/vm"
import type { WinPackager } from "../winPackager"
import { CustomWindowsSign, getSigntoolFamilyConfig, SigntoolBaseSignManager, WindowsSignTaskConfiguration } from "./signtoolBaseSignManager"

export class HsmSignManager extends SigntoolBaseSignManager {
  constructor(packager: WinPackager) {
    super(packager)
    if (packager.platformSpecificBuildOptions.signing?.type !== "hsm") {
      throw new Error(`HsmSignManager requires signing.type = "hsm"`)
    }
  }

  // HSM requires a certificate identifier; throw rather than silently skip.
  protected override handleNullCscInfo(customSign: CustomWindowsSign | string | null | undefined): boolean {
    if (!customSign) {
      throw new InvalidConfigurationError("HSM signing requires a certificate identifier. Provide certificateFile (e.g. a .crt/.pfx), certificateSha1, or certificateSubjectName.")
    }
    return false
  }

  protected computeWindowsSignArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string> {
    if (this.isLegacyToolset()) {
      throw new InvalidConfigurationError(
        "HSM signing requires winCodeSign toolset 1.x or later. " + 'Set toolsets.winCodeSign to "1.0.0" or "1.1.0" in your electron-builder configuration.'
      )
    }

    const signing = getSigntoolFamilyConfig(options.options) as WindowsHsmSigningConfig
    const inputFile = vm.toVmFile(options.path)
    const args = ["sign"]

    // Timestamping
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      const isRfc3161 = options.isNest || options.hash === "sha256"
      args.push(isRfc3161 ? "/tr" : "/t")
      args.push(isRfc3161 ? signing.rfc3161TimeStampServer || "http://timestamp.digicert.com" : signing.timeStampServer || "http://timestamp.digicert.com")
    }

    // .crt/.cer allowed: public chain only, private key lives in the HSM.
    this.addCertificateArgs(args, options, vm, true, true)

    // HSM: /csp and /kc immediately after certificate identification
    args.push("/csp", signing.cryptoServiceProvider)
    args.push("/kc", signing.keyContainer)

    // Modern toolset always requires /fd; no sha1 dual-sign path for HSM
    args.push("/fd", options.hash.toLowerCase())
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true" && (options.isNest || options.hash === "sha256")) {
      args.push("/td", "sha256")
    }

    this.addCommonSigningArgs(args, options, vm, true)
    args.push("/debug")
    args.push(inputFile)

    return args
  }

  protected computeOsslsigncodeArgs(_options: WindowsSignTaskConfiguration, _vm: VmManager): Array<string> {
    throw new InvalidConfigurationError(
      "HSM signing via cryptoServiceProvider/keyContainer is only supported on Windows (signtool.exe). " + 'For macOS/Linux, use type: "pkcs11" instead.'
    )
  }
}
