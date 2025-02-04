// test custom windows sign using path to file
export default async function (configuration) {
  const info = configuration.cscInfo
  expect(info.file).toEqual("secretFile")
  expect(info.password).toEqual("pass")
}
