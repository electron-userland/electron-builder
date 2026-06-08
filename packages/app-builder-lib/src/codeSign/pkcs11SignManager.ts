import { InvalidConfigurationError } from "builder-util"
import { MemoLazy } from "builder-util-runtime"
import { WindowsConfiguration, WindowsPkcs11SigningConfig } from "../options/winOptions"
import { VmManager } from "../vm/vm"
import type { WinPackager } from "../winPackager"
import { CustomWindowsSign, CertificateFromStoreInfo, FileCodeSigningInfo, getSigntoolFamilyConfig, SigntoolBaseSignManager, WindowsSignTaskConfiguration } from "./signtoolBaseSignManager"

export class Pkcs11SignManager extends SigntoolBaseSignManager {
  private readonly signingConfig: WindowsPkcs11SigningConfig

  constructor(packager: WinPackager) {
    super(packager)
    const signing = packager.platformSpecificBuildOptions.signing
    if (signing?.type !== "pkcs11") {
      throw new Error(`Pkcs11SignManager requires signing.type = "pkcs11", got: ${signing?.type}`)
    }
    this.signingConfig = signing
  }

  // PKCS#11: key and cert are in the hardware token; cert file is optional (chain only).
  override readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.platformSpecificBuildOptions,
    _platformSpecificBuildOptions => {
      const { certificateFile } = this.signingConfig
      if (certificateFile) {
        return Promise.resolve({ file: certificateFile, password: null })
      }
      return Promise.resolve(null)
    }
  )

  // PKCS#11: always proceed — the key URI is sufficient, no cert file required.
  protected override handleNullCscInfo(_customSign: CustomWindowsSign | string | null | undefined): boolean {
    return false
  }

  protected computeWindowsSignArgs(_options: WindowsSignTaskConfiguration, _vm: VmManager): Array<string> {
    throw new InvalidConfigurationError(
      'PKCS#11 signing is only supported via osslsigncode (non-Windows). Use type: "signtool" or type: "hsm" on Windows.'
    )
  }

  protected computeOsslsigncodeArgs(options: WindowsSignTaskConfiguration, vm: VmManager): Array<string> {
    const signing = getSigntoolFamilyConfig(options.options) as WindowsPkcs11SigningConfig

    // Runtime guard: JSON configs can produce partial objects that bypass TypeScript.
    if (!signing.pkcs11Module || !signing.pkcs11KeyUri) {
      throw new InvalidConfigurationError('pkcs11Module and pkcs11KeyUri must both be set for type: "pkcs11" signing.')
    }

    const inputFile = vm.toVmFile(options.path)
    const outputPath = this.getOutputPath(inputFile, options.hash)
    options.resultOutputPath = outputPath

    const args = ["sign", "-in", inputFile, "-out", outputPath]

    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      args.push("-t", signing.timeStampServer || "http://timestamp.digicert.com")
    }

    args.push("-pkcs11module", signing.pkcs11Module)
    args.push("-key", signing.pkcs11KeyUri)
    args.push("-h", options.hash.toLowerCase())
    this.addCommonSigningArgs(args, options, vm, false)

    const httpsProxy = process.env.HTTPS_PROXY
    if (httpsProxy?.length) {
      args.push("-p", httpsProxy)
    }

    return args
  }
}
