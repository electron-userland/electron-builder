// test custom windows sign using dynamic import
import { CustomWindowsSignTaskConfiguration, FileCodeSigningInfo } from "electron-builder"

export default function (configuration: CustomWindowsSignTaskConfiguration) {
  const info = configuration.cscInfo! as FileCodeSigningInfo
  expect(info.file).toEqual("secretFile")
  expect(info.password).toEqual("pass")
}
