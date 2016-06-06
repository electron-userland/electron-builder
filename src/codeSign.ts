import { exec, getTempName } from "./util"
import { deleteFile, outputFile, copy, rename } from "fs-extra-p"
import { download } from "./httpRequest"
import { tmpdir } from "os"
import * as path from "path"
import { executeFinally, all } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { randomBytes } from "crypto"
import { homedir } from "os"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export const appleCertificatePrefixes = ["Developer ID Application:", "3rd Party Mac Developer Application:", "Developer ID Installer:", "3rd Party Mac Developer Installer:"]

export type CertType = "Developer ID Application" | "3rd Party Mac Developer Application" | "Developer ID Installer" | "3rd Party Mac Developer Installer"

export interface CodeSigningInfo {
  name: string
  keychainName?: string | null

  installerName?: string | null
}

export function generateKeychainName(): string {
  return path.join(tmpdir(), getTempName("csc") + ".keychain")
}

function downloadUrlOrBase64(urlOrBase64: string, destination: string): BluebirdPromise<any> {
  if (urlOrBase64.startsWith("https://")) {
    return download(urlOrBase64, destination)
  }
  else {
    return outputFile(destination, new Buffer(urlOrBase64, "base64"))
  }
}

let bundledCertKeychainAdded: Promise<any> | null = null

// "Note that filename will not be searched to resolve the signing identity's certificate chain unless it is also on the user's keychain search list."
// but "security list-keychains" doesn't support add - we should 1) get current list 2) set new list - it is very bad http://stackoverflow.com/questions/10538942/add-a-keychain-to-search-list
// "overly complicated and introduces a race condition."
// https://github.com/electron-userland/electron-builder/issues/398
async function createCustomCertKeychain() {
  // copy to temp and then atomic rename to final path
  const tmpKeychainPath = path.join(homedir(), ".cache", getTempName("electron_builder_root_certs"))
  const keychainPath = path.join(homedir(), ".cache", "electron_builder_root_certs.keychain")
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

export async function createKeychain(keychainName: string, cscLink: string, cscKeyPassword: string, cscILink?: string | null, cscIKeyPassword?: string | null): Promise<CodeSigningInfo> {
  if (bundledCertKeychainAdded == null) {
    bundledCertKeychainAdded = createCustomCertKeychain()
  }
  await bundledCertKeychainAdded

  const certLinks = [cscLink]
  if (cscILink != null) {
    certLinks.push(cscILink)
  }

  const certPaths = new Array(certLinks.length)
  const keychainPassword = randomBytes(8).toString("hex")
  return await executeFinally(BluebirdPromise.all([
      BluebirdPromise.map(certLinks, (link, i) => {
        const tempFile = path.join(tmpdir(), `${getTempName()}.p12`)
        certPaths[i] = tempFile
        return downloadUrlOrBase64(link, tempFile)
      }),
      BluebirdPromise.mapSeries([
        ["create-keychain", "-p", keychainPassword, keychainName],
        ["unlock-keychain", "-p", keychainPassword, keychainName],
        ["set-keychain-settings", "-t", "3600", "-u", keychainName]
      ], it => exec("security", it))
    ])
    .then(() => importCerts(keychainName, certPaths, <Array<string>>[cscKeyPassword, cscIKeyPassword].filter(it => it != null))),
    errorOccurred => {
      const tasks = certPaths.map(it => deleteFile(it, true))
      if (errorOccurred) {
        tasks.push(deleteKeychain(keychainName))
      }
      return all(tasks)
    })
}

async function importCerts(keychainName: string, paths: Array<string>, keyPasswords: Array<string>): Promise<CodeSigningInfo> {
  const namePromises: Array<Promise<string>> = []
  for (let i = 0; i < paths.length; i++) {
    const password = keyPasswords[i]
    const certPath = paths[i]
    await exec("security", ["import", certPath, "-k", keychainName, "-T", "/usr/bin/codesign", "-T", "/usr/bin/productbuild", "-P", password])

    namePromises.push(extractCommonName(password, certPath))
  }

  const names = await BluebirdPromise.all(namePromises)
  return {
    name: names[0],
    installerName: names.length > 1 ? names[1] : null,
    keychainName: keychainName,
  }
}

function extractCommonName(password: string, certPath: string): BluebirdPromise<string> {
  return exec("openssl", ["pkcs12", "-nokeys", "-nodes", "-passin", "pass:" + password, "-nomacver", "-clcerts", "-in", certPath])
    .then(result => {
      const match = <Array<string | null> | null>(result.match(/^subject.*\/CN=([^\/\n]+)/m))
      if (match == null || match[1] == null) {
        throw new Error("Cannot extract common name from p12")
      }
      else {
        return match[1]!
      }
    })
}

export function sign(path: string, options: CodeSigningInfo): BluebirdPromise<any> {
  const args = ["--deep", "--force", "--sign", options.name, path]
  if (options.keychainName != null) {
    args.push("--keychain", options.keychainName)
  }
  return exec("codesign", args)
}

export function deleteKeychain(keychainName: string, ignoreNotFound: boolean = true): BluebirdPromise<any> {
  const result = exec("security", ["delete-keychain", keychainName])
  if (ignoreNotFound) {
    return result.catch(error => {
      if (!error.message.includes("The specified keychain could not be found.")) {
        throw error
      }
    })
  }
  else {
    return result
  }
}

export function downloadCertificate(cscLink: string): Promise<string> {
  const certPath = path.join(tmpdir(), `${getTempName()}.p12`)
  return downloadUrlOrBase64(cscLink, certPath)
    .thenReturn(certPath)
}

export let findIdentityRawResult: Promise<string> | null = null

export async function findIdentity(namePrefix: CertType, qualifier?: string): Promise<string | null> {
  if (findIdentityRawResult == null) {
      findIdentityRawResult = exec("security", ["find-identity", "-v", "-p", "codesigning"])
  }

  const lines = (await findIdentityRawResult).trim().split("\n")
  // ignore last line valid identities found
  lines.length = lines.length - 1

  for (let line of lines) {
    if (qualifier != null && !line.includes(qualifier)) {
      continue
    }

    if (line.includes(namePrefix)) {
      return line.substring(line.indexOf('"') + 1, line.lastIndexOf('"'))
    }
  }

  if (namePrefix === "Developer ID Application") {
    // find non-Apple certificate
    // https://github.com/electron-userland/electron-builder/issues/458
    l: for (let line of lines) {
      if (qualifier != null && !line.includes(qualifier)) {
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