import { downloadBuilderToolset } from "app-builder-lib/out/util/electronGet"
import { resolveEnvToolsetPath } from "builder-util"

export const squirrelWindowsChecksums = {
  // 1.1.0 bundled the Chocolatey shim instead of the standalone NuGet.CommandLine portable exe.
  // 1.1.1 fixes that; update after squirrel.windows@1.1.1 is published to electron-builder-binaries.
  "1.1.1": {
    "squirrel.windows-2.0.1-patched.zip": "TODO-update-after-squirrel.windows@1.1.1-is-published",
  },
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
  const toolset = "1.1.1"
  return downloadBuilderToolset({
    releaseName: `squirrel.windows@${toolset}`,
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: squirrelWindowsChecksums[toolset],
  })
}
