// test custom windows sign using path to file

import { CustomWindowsSignTaskConfiguration, FileCodeSigningInfo } from "electron-builder"

export default async function (configuration: CustomWindowsSignTaskConfiguration) {
  const info = configuration.cscInfo!! as FileCodeSigningInfo
  expect(info.file).toEqual("secretFile")
  expect(info.password).toEqual("pass")
}
