import { exec, getTempName, isEmptyOrSpaces, isCi, getCacheDirectory, statOrNull } from "./util/util"
import { deleteFile, outputFile, copy, rename } from "fs-extra-p"
import { download } from "./util/httpRequest"
import * as path from "path"
import { executeFinally, all } from "./util/promise"
import BluebirdPromise from "bluebird-lst-c"
import { randomBytes } from "crypto"
import { TmpDir } from "./util/tmp"
import { homedir } from "os"

export const appleCertificatePrefixes = ["Developer ID Application:", "Developer ID Installer:", "3rd Party Mac Developer Application:", "3rd Party Mac Developer Installer:"]

export type CertType = "Developer ID Application" | "Developer ID Installer" | "3rd Party Mac Developer Application" | "3rd Party Mac Developer Installer" | "Mac Developer"

export interface CodeSigningInfo {
  keychainName?: string | null
}

export async function downloadCertificate(urlOrBase64: string, tmpDir: TmpDir): Promise<string> {
  let file: string | null = null
  if ((urlOrBase64.length > 3 && urlOrBase64[1] === ":") || urlOrBase64.startsWith("/")) {
    file = urlOrBase64
  }
  else if (urlOrBase64.startsWith("file://")) {
    file = urlOrBase64.substring("file://".length)
  }
  else if (urlOrBase64.startsWith("~/")) {
    file = path.join(homedir(), urlOrBase64.substring("~/".length))
  }
  else {
    const tempFile = await tmpDir.getTempFile(".p12")
    if (urlOrBase64.startsWith("https://")) {
      await download(urlOrBase64, tempFile)
    }
    else {
      await outputFile(tempFile, new Buffer(urlOrBase64, "base64"))
    }
    return tempFile
  }

  const stat = await statOrNull(file)
  if (stat == null) {
    throw new Error(`${file} doesn't exist`)
  }
  else if (!stat.isFile()) {
    throw new Error(`${file} not a file`)
  }
  else {
    return file
  }
}

let bundledCertKeychainAdded: Promise<any> | null = null

// "Note that filename will not be searched to resolve the signing identity's certificate chain unless it is also on the user's keychain search list."
// but "security list-keychains" doesn't support add - we should 1) get current list 2) set new list - it is very bad http://stackoverflow.com/questions/10538942/add-a-keychain-to-search-list
// "overly complicated and introduces a race condition."
// https://github.com/electron-userland/electron-builder/issues/398
async function createCustomCertKeychain() {
  // copy to temp and then atomic rename to final path
  const tmpKeychainPath = path.join(getCacheDirectory(), getTempName("electron-builder-root-certs"))
  const keychainPath = path.join(getCacheDirectory(), "electron-builder-root-certs.keychain")
  const results = await BluebirdPromise.all<string>([
    exec("security", ["list-keychains"]),
    copy(path.join(__dirname, "..", "certs", "root_certs.keychain"), tmpKeychainPath)
      .then(() => rename(tmpKeychainPath, keychainPath)),
  ])
  const list = results[0]
    .split("\n")
    .map(it => {
      let r = it.trim()
      return r.substring(1, r.length - 1)
    })
    .filter(it => it.length > 0)

  if (!list.includes(keychainPath)) {
    await exec("security", ["list-keychains", "-d", "user", "-s", keychainPath].concat(list))
  }
}

export async function createKeychain(tmpDir: TmpDir, cscLink: string, cscKeyPassword: string, cscILink?: string | null, cscIKeyPassword?: string | null): Promise<CodeSigningInfo> {
  if (bundledCertKeychainAdded == null) {
    bundledCertKeychainAdded = createCustomCertKeychain()
  }
  await bundledCertKeychainAdded

  const keychainName = await tmpDir.getTempFile(".keychain")

  const certLinks = [cscLink]
  if (cscILink != null) {
    certLinks.push(cscILink)
  }

  const certPaths = new Array(certLinks.length)
  const keychainPassword = randomBytes(8).toString("hex")
  return await executeFinally(BluebirdPromise.all([
      BluebirdPromise.map(certLinks, (link, i) => downloadCertificate(link, tmpDir).then(it => certPaths[i] = it)),
      BluebirdPromise.mapSeries([
        ["create-keychain", "-p", keychainPassword, keychainName],
        ["unlock-keychain", "-p", keychainPassword, keychainName],
        ["set-keychain-settings", "-t", "3600", "-u", keychainName]
      ], it => exec("security", it))
    ])
    .then<CodeSigningInfo>(() => importCerts(keychainName, certPaths, <Array<string>>[cscKeyPassword, cscIKeyPassword].filter(it => it != null))),
    () => all(certPaths.map((it, index) => certLinks[index].startsWith("https://") ? deleteFile(it, true) : BluebirdPromise.resolve())))
}

async function importCerts(keychainName: string, paths: Array<string>, keyPasswords: Array<string>): Promise<CodeSigningInfo> {
  for (let i = 0; i < paths.length; i++) {
    await exec("security", ["import", paths[i], "-k", keychainName, "-T", "/usr/bin/codesign", "-T", "/usr/bin/productbuild", "-P", keyPasswords[i]])
  }

  return {
    keychainName: keychainName,
  }
}

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
    result = BluebirdPromise.all<Array<string>>([
      exec("security", addKeychain(["find-identity", "-v"]))
        .then(it => it.trim().split("\n").filter(it => {
          for (let prefix of appleCertificatePrefixes) {
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

async function _findIdentity(type: CertType, qualifier?: string | null, keychain?: string | null): Promise<string | null> {
  // https://github.com/electron-userland/electron-builder/issues/484
  //noinspection SpellCheckingInspection
  const lines = await getValidIdentities(keychain)
  const namePrefix = `${type}:`
  for (let line of lines) {
    if (qualifier != null && !line.includes(qualifier)) {
      continue
    }

    if (line.includes(namePrefix)) {
      return line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'))
    }
  }

  if (type === "Developer ID Application") {
    // find non-Apple certificate
    // https://github.com/electron-userland/electron-builder/issues/458
    l: for (let line of lines) {
      if (qualifier != null && !line.includes(qualifier)) {
        continue
      }

      if (line.includes("Mac Developer:")) {
        continue
      }

      for (let prefix of appleCertificatePrefixes) {
        if (line.includes(prefix)) {
          continue l
        }
      }

      return line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'))
    }
  }
  return null
}

export async function findIdentity(certType: CertType, qualifier?: string | null, keychain?: string | null): Promise<string | null> {
  let identity = process.env.CSC_NAME || qualifier
  if (isEmptyOrSpaces(identity)) {
    if (keychain == null && !isCi() && (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false")) {
      return null
    }
    else {
      return await _findIdentity(certType, null, keychain)
    }
  }
  else {
    identity = identity.trim()
    for (let prefix of appleCertificatePrefixes) {
      checkPrefix(identity, prefix)
    }
    const result = await _findIdentity(certType, identity, keychain)
    if (result == null) {
      throw new Error(`Identity name "${identity}" is specified, but no valid identity with this name in the keychain`)
    }
    return result
  }
}

function checkPrefix(name: string, prefix: string) {
  if (name.startsWith(prefix)) {
    throw new Error(`Please remove prefix "${prefix}" from the specified name — appropriate certificate will be chosen automatically`)
  }
}