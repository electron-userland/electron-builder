import { downloadBuilderToolset } from "app-builder-lib/out/util/electronGet"
import { resolveEnvToolsetPath } from "builder-util"

export const squirrelWindowsChecksums = {
  "1.1.0": {
    "squirrel.windows-2.0.1-patched.zip": "86e6c3e9ebf10e29cfde99dfff98f3738c29c9562495c540270129ffde1f79cf",
  },
  // 1.1.1 will add rcedit.exe to the vendor directory directly; update after it is published.
  "1.1.1": {
    "squirrel.windows-2.0.1-patched.zip": "TODO-update-after-squirrel.windows@1.1.1-is-published",
  },
} as const

/**
 * Returns the path to the squirrel.windows toolset directory. The directory
 * contains an `electron-winstaller/vendor/` subtree with all vendor executables
 * (Squirrel.exe, nuget.exe, rcedit.exe, 7z, etc.).
 *
 * Override with ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR for local development or
 * to pin a custom build.
 */
export async function getSquirrelToolsetPath(): Promise<string> {
  const envPath = await resolveEnvToolsetPath("ELECTRON_BUILDER_SQUIRREL_TOOLSET_DIR", "directory")
  if (envPath != null) {
    return envPath
  }
  const toolset = "1.1.0"
  return downloadBuilderToolset({
    releaseName: `squirrel.windows@${toolset}`,
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums[toolset],
  })
}
