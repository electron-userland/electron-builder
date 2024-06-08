import { readFile, writeFile } from "fs/promises"
import { log } from "builder-util"
import { NtExecutable, NtExecutableResource, Resource } from "resedit"
import { AsarIntegrity } from "../asar/integrity"

/** @internal */
export async function addWinAsarIntegrity(executablePath: string, asarIntegrity: AsarIntegrity) {
  const buffer = await readFile(executablePath)
  const executable = NtExecutable.from(buffer)
  const resource = NtExecutableResource.from(executable)

  const versionInfo = Resource.VersionInfo.fromEntries(resource.entries)
  if (versionInfo.length !== 1) {
    throw new Error(`Failed to parse version info in ${executablePath}`)
  }

  const languages = versionInfo[0].getAllLanguagesForStringValues()
  if (languages.length !== 1) {
    throw new Error(`Failed to locate languages in ${executablePath}`)
  }

  // See: https://github.com/electron/packager/blob/00d20b99cf4aa4621103dbbd09ff7de7d2f7f539/src/resedit.ts#L124
  const integrityList = Array.from(Object.entries(asarIntegrity)).map(([file, { algorithm: alg, hash: value }]) => ({
    file,
    alg,
    value,
  }))

  resource.entries.push({
    type: "INTEGRITY",
    id: "ELECTRONASAR",
    bin: Buffer.from(JSON.stringify(integrityList)),
    lang: languages[0].lang,
    codepage: languages[0].codepage,
  })

  resource.outputResource(executable)

  await writeFile(executablePath, Buffer.from(executable.generate()))
  log.info({ executablePath }, "updating asar integrity executable resource")
}
