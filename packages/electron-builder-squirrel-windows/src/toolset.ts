import { downloadBuilderToolset } from "app-builder-lib/out/util/electronGet"
import { resolveEnvToolsetPath } from "builder-util"

const squirrelWindowsChecksums = {
  // TODO: update after the squirrel.windows@1.0.0 release is officially published to
  // electron-userland/electron-builder-binaries. This value was computed from a local
  // CI artifact build and may differ from the final published archive.
  "squirrel.windows-2.0.1-patched.tar.gz": "140f625bd26e5022c333993de580fb028033d4940e368bc41960329f92ff6334455dde53cb0834f9529a871e86700abbbaaa681aece40892675b2b25bb22e870",
} as const

/**
 * Returns the path to the squirrel.windows toolset directory. The directory
 * contains an `electron-winstaller/vendor/` subtree with all vendor executables
 * (Squirrel.exe, nuget.exe, 7z, etc.).
 *
 * Override with ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR for local development or
 * to pin a custom build.
 */
export async function getSquirrelToolsetPath(): Promise<string> {
  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return envPath
  }
  return downloadBuilderToolset({
    releaseName: "squirrel.windows@1.0.0",
    filenameWithExt: "squirrel.windows-2.0.1-patched.tar.gz",
    checksums: squirrelWindowsChecksums,
  })
}
