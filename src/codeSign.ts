import { exec } from "./util"
import { deleteFile } from "./promisifed-fs"
import { download } from "./httpRequest"
import { tmpdir } from "os"
import * as path from "path"
import { executeFinally, all } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { randomBytes } from "crypto"
import { tsAwaiter } from "./awaiter"

const __awaiter = tsAwaiter
Array.isArray(__awaiter)

export interface CodeSigningInfo {
  cscName: string
  cscKeychainName?: string
}

function randomString(): string {
  return randomBytes(8).toString("hex")
}

export function generateKeychainName(): string {
  return "csc-" + randomString() + ".keychain"
}

export function createKeychain(keychainName: string, cscLink: string, cscKeyPassword: string): Promise<CodeSigningInfo> {
  const appleCertPath = path.join(tmpdir(), randomString() + ".cer")
  const developerCertPath = path.join(tmpdir(), randomString() + ".p12")

  const keychainPassword = randomString()
  return executeFinally(Promise.all([
      download("https://developer.apple.com/certificationauthority/AppleWWDRCA.cer", appleCertPath),
      download(cscLink, developerCertPath),
      BluebirdPromise.mapSeries([
        ["create-keychain", "-p", keychainPassword, keychainName],
        ["unlock-keychain", "-p", keychainPassword, keychainName],
        ["set-keychain-settings", "-t", "3600", "-u", keychainName]
      ], it => exec("security", it))
    ])
    .then(() => importCerts(keychainName, appleCertPath, developerCertPath, cscKeyPassword)),
    error => {
      const tasks = [deleteFile(appleCertPath, true), deleteFile(developerCertPath, true)]
      if (error != null) {
        tasks.push(deleteKeychain(keychainName))
      }
      return all(tasks)
    })
}

async function importCerts(keychainName: string, appleCertPath: string, developerCertPath: string, cscKeyPassword: string): Promise<CodeSigningInfo> {
  await exec("security", ["import", appleCertPath, "-k", keychainName, "-T", "/usr/bin/codesign"])
  await exec("security", ["import", developerCertPath, "-k", keychainName, "-T", "/usr/bin/codesign", "-P", cscKeyPassword])
  let cscName = await extractCommonName(cscKeyPassword, developerCertPath)
  return {
    cscName: cscName,
    cscKeychainName: keychainName
  }
}

function extractCommonName(password: string, certPath: string): BluebirdPromise<string> {
  return exec("openssl", ["pkcs12", "-nokeys", "-nodes", "-passin", "pass:" + password, "-nomacver", "-clcerts", "-in", certPath])
    .then(result => {
      const match = result[0].toString().match(/^subject.*\/CN=([^\/]+)/m)
      if (match == null || match[1] == null) {
        throw new Error("Cannot extract common name from p12")
      }
      else {
        return match[1]
      }
    })
}

export function sign(path: string, options: CodeSigningInfo): BluebirdPromise<any> {
  const args = ["--deep", "--force", "--sign", options.cscName, path]
  if (options.cscKeychainName != null) {
    args.push("--keychain", options.cscKeychainName)
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
  return download(cscLink, certPath)
    .thenReturn(certPath)
}