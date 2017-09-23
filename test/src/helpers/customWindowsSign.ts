// test custom windows sign using path to file

import { CustomWindowsSignTaskConfiguration } from "electron-builder"

export default async function(configuration: CustomWindowsSignTaskConfiguration) {
  expect(configuration.cert).toEqual("secretFile")
  expect(configuration.password).toEqual("pass")
}