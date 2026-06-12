import { InvalidConfigurationError } from "builder-util"
import { MemoLazy } from "builder-util-runtime"
import { resolveWindowsSigningConfiguration, WindowsConfiguration, WindowsPkcs11SigningConfig } from "../options/winOptions.js"
import { VmManager } from "../vm/vm.js"
import type { WinPackager } from "../winPackager.js"
import {
  CustomWindowsSign,
  CertificateFromStoreInfo,
  FileCodeSigningInfo,
  getSigntoolFamilyConfig,
  SigntoolBaseSignManager,
  WindowsSignTaskConfiguration,
} from "./signtoolBaseSignManager.js"

export class Pkcs11SignManager extends SigntoolBaseSignManager {
  private readonly signingConfig: WindowsPkcs11SigningConfig

  constructor(packager: WinPackager) {
    super(packager)
    const signing = resolveWindowsSigningConfiguration(packager.platformOptions)
    if (signing?.type !== "pkcs11") {
      throw new Error(`Pkcs11SignManager requires signing.type = "pkcs11", got: ${signing?.type}`)
    }
    this.signingConfig = signing
  }

  // PKCS#11: key and cert are in the hardware token; cert file is optional (chain only).
  // When a cert file is supplied, the PIN (if any) is read from WIN_CSC_KEY_PASSWORD / CSC_KEY_PASSWORD.
  override readonly cscInfo = new MemoLazy<WindowsConfiguration, FileCodeSigningInfo | CertificateFromStoreInfo | null>(
    () => this.platformSpecificBuildOptions,
    _platformSpecificBuildOptions => {
      const { certificateFile } = this.signingConfig
      if (certificateFile) {
        const pin = this.packager.getCscPassword() ?? null
        return Promise.resolve({ file: certificateFile, password: pin })
      }
      return Promise.resolve(null)
    }
  )

  // PKCS#11: always proceed — the key URI is sufficient, no cert file required.
  protected override handleNullCscInfo(_customSign: CustomWindowsSign | string | null | undefined): boolean {
    return false
  }

  protected computeWindowsSignArgs(_options: WindowsSignTaskConfiguration, _vm: VmManager): Array<string> {
    throw new InvalidConfigurationError('PKCS#11 signing is only supported via osslsigncode (non-Windows). Use type: "signtool" or type: "hsm" on Windows.')
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

    // RFC 3161 for sha256/nested (mirrors signtool /tr); HTTP Authenticode for sha1 (/t).
    if (process.env.ELECTRON_BUILDER_OFFLINE !== "true") {
      const isRfc3161 = options.isNest || options.hash === "sha256"
      if (isRfc3161) {
        args.push("-ts", signing.rfc3161TimeStampServer || "http://timestamp.digicert.com")
      } else {
        args.push("-t", signing.timeStampServer || "http://timestamp.digicert.com")
      }
    }

    args.push("-pkcs11module", signing.pkcs11Module)
    args.push("-key", signing.pkcs11KeyUri)

    // External certificate chain (optional — token may carry the cert internally).
    if (signing.certificateFile) {
      args.push("-certs", vm.toVmFile(signing.certificateFile))
    }

    args.push("-h", options.hash.toLowerCase())
    this.addCommonSigningArgs(args, options, vm, false)

    // When cscInfo is null the token holds the cert; addCommonSigningArgs won't emit -pass.
    // Read the PIN from env vars so CI workflows can inject it without embedding it in the URI.
    if (!options.cscInfo) {
      const pin = process.env.WIN_CSC_KEY_PASSWORD ?? process.env.CSC_KEY_PASSWORD
      if (pin?.trim()) {
        args.push("-pass", pin.trim())
      }
    }

    const httpsProxy = process.env.HTTPS_PROXY
    if (httpsProxy?.length) {
      args.push("-p", httpsProxy)
    }

    return args
  }
}
