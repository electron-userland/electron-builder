import { downloadBuilderToolset } from "app-builder-lib/out/util/electronGet"
import { resolveEnvToolsetPath } from "builder-util"

export const squirrelWindowsChecksums = {
  // 1.1.0 bundled the Chocolatey shim instead of the standalone NuGet.CommandLine portable exe.
  // 1.1.1 fixes that; checksum will be set once the new archive is published.
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
  const tempUpgrade = {
    filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
    checksums: {
      "squirrel.windows-2.0.1-patched.zip": "00ce495de66c4e985474e58e07c2713f07db955c8da3f90a115e66aa31fb4ffe",
    },
    overrideUrl: "https://github.com/electron-userland/electron-builder-binaries/actions/runs/26968100864/artifacts/7418460150",
  }
  return downloadBuilderToolset({
    releaseName: "squirrel.windows@1.1.1-temp-upgrade",
    ...tempUpgrade,
  })
  // const toolset = "1.1.1"
  // return downloadBuilderToolset({
  //   releaseName: `squirrel.windows@${toolset}`,
  //   filenameWithExt: "squirrel.windows-2.0.1-patched.zip",
  //   checksums: squirrelWindowsChecksums[toolset],
  // })
}
