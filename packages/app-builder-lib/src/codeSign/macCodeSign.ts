import BluebirdPromise from "bluebird-lst"
import { exec, InvalidConfigurationError, isEmptyOrSpaces, isEnvTrue, isPullRequest, log, TmpDir } from "builder-util/out/util"
import { copyFile, unlinkIfExists } from "builder-util/out/fs"
import { Fields, Logger } from "builder-util/out/log"
import { randomBytes, createHash } from "crypto"
import { rename } from "fs-extra"
import { Lazy } from "lazy-val"
import { homedir, tmpdir } from "os"
import * as path from "path"
import { getTempName } from "temp-file"
import { isAutoDiscoveryCodeSignIdentity } from "../util/flags"
import { downloadCertificate } from "./codesign"

export const appleCertificatePrefixes = ["Developer ID Application:", "Developer ID Installer:", "3rd Party Mac Developer Application:", "3rd Party Mac Developer Installer:"]

export type CertType = "Developer ID Application" | "Developer ID Installer" | "3rd Party Mac Developer Application" | "3rd Party Mac Developer Installer" | "Mac Developer"

export interface CodeSigningInfo {
  keychainFile?: string | null
}

export function isSignAllowed(isPrintWarn = true): boolean {
  if (process.platform !== "darwin") {
    if (isPrintWarn) {
      log.warn({reason: "supported only on macOS"}, "skipped macOS application code signing")
    }
    return false
  }

  const buildForPrWarning = "There are serious security concerns with CSC_FOR_PULL_REQUEST=true (see the  CircleCI documentation (https://circleci.com/docs/1.0/fork-pr-builds/) for details)" +
    "\nIf you have SSH keys, sensitive env vars or AWS credentials stored in your project settings and untrusted forks can make pull requests against your repo, then this option isn't for you."

  if (isPullRequest()) {
    if (isEnvTrue(process.env.CSC_FOR_PULL_REQUEST)) {
      if (isPrintWarn) {
        log.warn(buildForPrWarning)
      }
    }
    else {
      if (isPrintWarn) {
        // https://github.com/electron-userland/electron-builder/issues/1524
        log.warn("Current build is a part of pull request, code signing will be skipped." +
          "\nSet env CSC_FOR_PULL_REQUEST to true to force code signing." +
          `\n${buildForPrWarning}`)
      }
      return false
    }
  }
  return true
}

export async function reportError(isMas: boolean, certificateType: CertType, qualifier: string | null | undefined, keychainFile: string | null | undefined, isForceCodeSigning: boolean) {
  const logFields: Fields = {}
  if (qualifier == null) {
    logFields.reason = ""
    if (isAutoDiscoveryCodeSignIdentity()) {
      logFields.reason += `cannot find valid "${certificateType}" identity${(isMas ? "" : ` or custom non-Apple code signing certificate`)}`
    }
    logFields.reason += ", see https://electron.build/code-signing"
    if (!isAutoDiscoveryCodeSignIdentity()) {
      logFields.CSC_IDENTITY_AUTO_DISCOVERY = false
    }
  }
  else {
    logFields.reason = "Identity name is specified, but no valid identity with this name in the keychain"
    logFields.identity = qualifier
  }

  const args = ["find-identity"]
  if (keychainFile != null) {
    args.push(keychainFile)
  }

  if (qualifier != null || isAutoDiscoveryCodeSignIdentity()) {
    logFields.allIdentities = (await exec("security", args))
      .trim()
      .split("\n")
      .filter(it => !(it.includes("Policy: X.509 Basic") || it.includes("Matching identities")))
      .join("\n")
  }

  if (isMas || isForceCodeSigning) {
    throw new Error(Logger.createMessage("skipped macOS application code signing", logFields, "error", it => it))
  }
  else {
    log.warn(logFields, "skipped macOS application code signing")
  }
}

// "Note that filename will not be searched to resolve the signing identity's certificate chain unless it is also on the user's keychain search list."
// but "security list-keychains" doesn't support add - we should 1) get current list 2) set new list - it is very bad http://stackoverflow.com/questions/10538942/add-a-keychain-to-search-list
// "overly complicated and introduces a race condition."
// https://github.com/electron-userland/electron-builder/issues/398
const bundledCertKeychainAdded = new Lazy<void>(async () => {
  // copy to temp and then atomic rename to final path
  const cacheDir = getCacheDirectory()
  const tmpKeychainPath = path.join(cacheDir, getTempName("electron-builder-root-certs"))
  const keychainPath = path.join(cacheDir, "electron-builder-root-certs.keychain")
  const results = await Promise.all<any>([
    listUserKeychains(),
    copyFile(path.join(__dirname, "..", "..", "certs", "root_certs.keychain"), tmpKeychainPath)
      .then(() => rename(tmpKeychainPath, keychainPath)),
  ])
  const list = results[0]
  if (!list.includes(keychainPath)) {
    await exec("security", ["list-keychains", "-d", "user", "-s", keychainPath].concat(list))
  }
})

function getCacheDirectory(): string {
  const env = process.env.ELECTRON_BUILDER_CACHE
  return isEmptyOrSpaces(env) ? path.join(homedir(), "Library", "Caches", "electron-builder") : path.resolve(env!!)
}

function listUserKeychains(): Promise<Array<string>> {
  return exec("security", ["list-keychains", "-d", "user"])
    .then(it => it
      .split("\n")
      .map(it => {
        const r = it.trim()
        return r.substring(1, r.length - 1)
      })
      .filter(it => it.length > 0))
}

export interface CreateKeychainOptions {
  tmpDir: TmpDir
  cscLink: string
  cscKeyPassword: string
  cscILink?: string | null
  cscIKeyPassword?: string | null
  currentDir: string
}

export function removeKeychain(keychainFile: string, printWarn = true): Promise<any> {
  return exec("security", ["delete-keychain", keychainFile])
    .catch(e => {
      if (printWarn) {
        log.warn({file: keychainFile, error: e.stack || e}, "cannot delete keychain")
      }
      return unlinkIfExists(keychainFile)
    })
}

export async function createKeychain({tmpDir, cscLink, cscKeyPassword, cscILink, cscIKeyPassword, currentDir}: CreateKeychainOptions): Promise<CodeSigningInfo> {
  // travis has correct AppleWWDRCA cert
  if (process.env.TRAVIS !== "true") {
    await bundledCertKeychainAdded.value
  }

  // https://github.com/electron-userland/electron-builder/issues/3685
  // use constant file
  const keychainFile = path.join(process.env.APP_BUILDER_TMP_DIR || tmpdir(), `${createHash("sha256").update(currentDir).update("app-builder").digest("hex")}.keychain`)
  // noinspection JSUnusedLocalSymbols
  await removeKeychain(keychainFile, false).catch(_ => {/* ignore*/})

  const certLinks = [cscLink]
  if (cscILink != null) {
    certLinks.push(cscILink)
  }

  const certPaths = new Array(certLinks.length)
  const keychainPassword = randomBytes(32).toString("base64")
  const securityCommands = [
    ["create-keychain", "-p", keychainPassword, keychainFile],
    ["unlock-keychain", "-p", keychainPassword, keychainFile],
    ["set-keychain-settings", keychainFile]
  ]

  // https://stackoverflow.com/questions/42484678/codesign-keychain-gets-ignored
  // https://github.com/electron-userland/electron-builder/issues/1457
  const list = await listUserKeychains()
  if (!list.includes(keychainFile)) {
    securityCommands.push(["list-keychains", "-d", "user", "-s", keychainFile].concat(list))
  }

  await Promise.all([
    // we do not clear downloaded files - will be removed on tmpDir cleanup automatically. not a security issue since in any case data is available as env variables and protected by password.
    BluebirdPromise.map(certLinks, (link, i) => downloadCertificate(link, tmpDir, currentDir).then(it => certPaths[i] = it)),
    BluebirdPromise.mapSeries(securityCommands, it => exec("security", it))
  ])
  return await importCerts(keychainFile, certPaths, [cscKeyPassword, cscIKeyPassword].filter(it => it != null) as Array<string>)
}

async function importCerts(keychainFile: string, paths: Array<string>, keyPasswords: Array<string>): Promise<CodeSigningInfo> {
  for (let i = 0; i < paths.length; i++) {
    const password = keyPasswords[i]
    await exec("security", ["import", paths[i], "-k", keychainFile, "-T", "/usr/bin/codesign", "-T", "/usr/bin/productbuild", "-P", password])

    // https://stackoverflow.com/questions/39868578/security-codesign-in-sierra-keychain-ignores-access-control-settings-and-ui-p
    // https://github.com/electron-userland/electron-packager/issues/701#issuecomment-322315996
    await exec("security", ["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile])
  }

  return {
    keychainFile,
  }
}

/** @private */
export function sign(path: string, name: string, keychain: string): Promise<any> {
  const args = ["--deep", "--force", "--sign", name, path]
  if (keychain != null) {
    args.push("--keychain", keychain)
  }
  return exec("codesign", args)
}

export let findIdentityRawResult: Promise<Array<string>> | null = null

async function getValidIdentities(keychain?: string | null): Promise<Array<string>> {
  function addKeychain(args: Array<string>) {
    if (keychain != null) {
      args.push(keychain)
    }
    return args
  }

  let result = findIdentityRawResult
  if (result == null || keychain != null) {
    // https://github.com/electron-userland/electron-builder/issues/481
    // https://github.com/electron-userland/electron-builder/issues/535
    result = Promise.all<Array<string>>([
      exec("security", addKeychain(["find-identity", "-v"]))
        .then(it => it.trim().split("\n").filter(it => {
          for (const prefix of appleCertificatePrefixes) {
            if (it.includes(prefix)) {
              return true
            }
          }
          return false
        })),
      exec("security", addKeychain(["find-identity", "-v", "-p", "codesigning"]))
        .then(it => it.trim().split(("\n"))),
    ])
      .then(it => {
        const array = it[0].concat(it[1])
          .filter(it => !it.includes("(Missing required extension)") && !it.includes("valid identities found") && !it.includes("iPhone ") && !it.includes("com.apple.idms.appleid.prd."))
          // remove 1)
          .map(it => it.substring(it.indexOf(")") + 1).trim())
        return Array.from(new Set(array))
      })

    if (keychain == null) {
      findIdentityRawResult = result
    }
  }
  return result
}

async function _findIdentity(type: CertType, qualifier?: string | null, keychain?: string | null): Promise<Identity | null> {
  // https://github.com/electron-userland/electron-builder/issues/484
  //noinspection SpellCheckingInspection
  const lines = await getValidIdentities(keychain)
  const namePrefix = `${type}:`
  for (const line of lines) {
    if (qualifier != null && !line.includes(qualifier)) {
      continue
    }

    if (line.includes(namePrefix)) {
      return parseIdentity(line)
    }
  }

  if (type === "Developer ID Application") {
    // find non-Apple certificate
    // https://github.com/electron-userland/electron-builder/issues/458
    l: for (const line of lines) {
      if (qualifier != null && !line.includes(qualifier)) {
        continue
      }

      if (line.includes("Mac Developer:")) {
        continue
      }

      for (const prefix of appleCertificatePrefixes) {
        if (line.includes(prefix)) {
          continue l
        }
      }

      return parseIdentity(line)
    }
  }
  return null
}

export declare class Identity {
  readonly name: string
  readonly hash: string

  constructor(name: string, hash: string)
}

const _Identity = require("../../electron-osx-sign/util-identities").Identity

function parseIdentity(line: string): Identity {
  const firstQuoteIndex = line.indexOf('"')
  const name = line.substring(firstQuoteIndex + 1, line.lastIndexOf('"'))
  const hash = line.substring(0, firstQuoteIndex - 1)
  return new _Identity(name, hash)
}

export function findIdentity(certType: CertType, qualifier?: string | null, keychain?: string | null): Promise<Identity | null> {
  let identity = qualifier || process.env.CSC_NAME
  if (isEmptyOrSpaces(identity)) {
    if (isAutoDiscoveryCodeSignIdentity()) {
      return _findIdentity(certType, null, keychain)
    }
    else {
      return Promise.resolve(null)
    }
  }
  else {
    identity = identity!.trim()
    for (const prefix of appleCertificatePrefixes) {
      checkPrefix(identity, prefix)
    }
    return _findIdentity(certType, identity, keychain)
  }
}

function checkPrefix(name: string, prefix: string) {
  if (name.startsWith(prefix)) {
    throw new InvalidConfigurationError(`Please remove prefix "${prefix}" from the specified name — appropriate certificate will be chosen automatically`)
  }
}