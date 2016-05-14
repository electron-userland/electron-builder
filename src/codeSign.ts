import { exec } from "./util"
import { deleteFile, outputFile } from "fs-extra-p"
import { download } from "./httpRequest"
import { tmpdir } from "os"
import * as path from "path"
import { executeFinally, all } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { randomBytes } from "crypto"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

export interface CodeSigningInfo {
  name: string
  keychainName?: string | null

  installerName?: string | null
}

function randomString(): string {
  return randomBytes(8).toString("hex")
}

export function generateKeychainName(): string {
  return "csc-" + randomString() + ".keychain"
}

function downloadUrlOrBase64(urlOrBase64: string, destination: string): BluebirdPromise<any> {
  if (urlOrBase64.startsWith("https://")) {
    return download(urlOrBase64, destination)
  }
  else {
    return outputFile(destination, new Buffer(urlOrBase64, "base64"))
  }
}

export function createKeychain(keychainName: string, cscLink: string, cscKeyPassword: string, cscILink?: string | null, cscIKeyPassword?: string | null, csaLink?: string | null): Promise<CodeSigningInfo> {
  const certLinks = csaLink == null ? [] : [csaLink]
  certLinks.push(cscLink)
  if (cscILink != null) {
    certLinks.push(cscILink)
  }

  const certPaths = certLinks.map(it => path.join(tmpdir(), randomString() + (it.endsWith(".cer") ? ".cer" : ".p12")))
  const keychainPassword = randomString()
  return executeFinally(BluebirdPromise.all([
      BluebirdPromise.map(certPaths, (p, i) => downloadUrlOrBase64(certLinks[i], p)),
      BluebirdPromise.mapSeries([
        ["create-keychain", "-p", keychainPassword, keychainName],
        ["unlock-keychain", "-p", keychainPassword, keychainName],
        ["set-keychain-settings", "-t", "3600", "-u", keychainName]
      ], it => exec("security", it))
    ])
    .then(() => importCerts(keychainName, certPaths, [cscKeyPassword, cscIKeyPassword].filter(it => it != null), csaLink == null)),
    errorOccurred => {
      const tasks = certPaths.map(it => deleteFile(it, true))
      if (errorOccurred) {
        tasks.push(deleteKeychain(keychainName))
      }
      return all(tasks)
    })
}

async function importCerts(keychainName: string, paths: Array<string>, keyPasswords: Array<string | null | undefined>, importBundledCerts: boolean): Promise<CodeSigningInfo> {
  const certFiles = paths.slice(0, -keyPasswords.length)
  if (importBundledCerts) {
    const bundledCertsPath = path.join(__dirname, "..", "certs")
    certFiles.push(
      path.join(bundledCertsPath, "AppleWWDRCA.cer"),
      path.join(bundledCertsPath, "bundle.crt")
    )
  }

  for (let file of certFiles) {
    await exec("security", ["import", file, "-k", keychainName, "-T", "/usr/bin/codesign"])
  }

  const namePromises: Array<Promise<string>> = []
  for (let i = paths.length - keyPasswords.length, j = 0; i < paths.length; i++, j++) {
    const password = keyPasswords[j]!
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
      const match = <Array<string | null> | null>(result[0].toString().match(/^subject.*\/CN=([^\/\n]+)/m))
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
  const certPath = path.join(tmpdir(), randomString() + ".p12")
  return downloadUrlOrBase64(cscLink, certPath)
    .thenReturn(certPath)
}
