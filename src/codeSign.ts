import { exec } from "./util"
import { deleteFile } from "fs-extra-p"
import { download } from "./httpRequest"
import { tmpdir } from "os"
import * as path from "path"
import { executeFinally, all } from "./promise"
import { Promise as BluebirdPromise } from "bluebird"
import { randomBytes } from "crypto"

//noinspection JSUnusedLocalSymbols
const __awaiter = require("./awaiter")

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

export function createKeychain(keychainName: string, cscLink: string, cscKeyPassword: string, csaLink?: string): Promise<CodeSigningInfo> {
  const authorityCertPath = path.join(tmpdir(), randomString() + ".cer")
  const developerCertPath = path.join(tmpdir(), randomString() + ".p12")

  const keychainPassword = randomString()
  return executeFinally(BluebirdPromise.all([
      download(csaLink || "https://developer.apple.com/certificationauthority/AppleWWDRCA.cer", authorityCertPath),
      download(cscLink, developerCertPath),
      BluebirdPromise.mapSeries([
        ["create-keychain", "-p", keychainPassword, keychainName],
        ["unlock-keychain", "-p", keychainPassword, keychainName],
        ["set-keychain-settings", "-t", "3600", "-u", keychainName]
      ], it => exec("security", it))
    ])
    .then(() => importCerts(keychainName, authorityCertPath, developerCertPath, cscKeyPassword)),
    errorOccurred => {
      const tasks = [deleteFile(authorityCertPath, true), deleteFile(developerCertPath, true)]
      if (errorOccurred) {
        tasks.push(deleteKeychain(keychainName))
      }
      return all(tasks)
    })
}

async function importCerts(keychainName: string, authorityCertPath: string, developerCertPath: string, cscKeyPassword: string): Promise<CodeSigningInfo> {
  await exec("security", ["import", authorityCertPath, "-k", keychainName, "-T", "/usr/bin/codesign"])
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