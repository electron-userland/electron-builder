import { findExecutable } from "app-builder-lib/internal"
import { InvalidConfigurationError, log } from "builder-util"
import * as path from "path"

/**
 * Install locations of Mono, in the order of the default PATH (Homebrew's shellenv and MacPorts prepend their `bin`; /etc/paths
 * puts /usr/local/bin ahead of the Mono framework's /etc/paths.d entry): Homebrew, MacPorts and the Mono framework of the
 * official macOS package (the `Commands` directory its installer puts on `PATH`, and the framework's `bin`) on macOS;
 * Homebrew, source builds and distribution or Mono project packages on Linux.
 */
export const HOST_MONO_PATHS: Partial<Record<NodeJS.Platform, ReadonlyArray<string>>> = {
  darwin: [
    "/opt/homebrew/bin/mono",
    "/usr/local/bin/mono",
    "/opt/local/bin/mono",
    "/Library/Frameworks/Mono.framework/Versions/Current/Commands/mono",
    "/Library/Frameworks/Mono.framework/Versions/Current/bin/mono",
  ],
  linux: ["/home/linuxbrew/.linuxbrew/bin/mono", "/usr/local/bin/mono", "/usr/bin/mono"],
}

let loggedMono: string | null = null

/**
 * The Mono that runs the Squirrel.Windows tools on macOS and Linux: `squirrelWindows.monoPath` when it is set, otherwise the
 * first of {@link HOST_MONO_PATHS} that is an executable file. Mono is started by absolute path, never looked up on `PATH`.
 */
export function resolveMonoPath(monoPath: string | null | undefined): string {
  if (monoPath != null) {
    if (!path.isAbsolute(monoPath) || findExecutable([monoPath]) == null) {
      throw new InvalidConfigurationError(
        `squirrelWindows.monoPath must be the absolute path of the mono executable, but "${monoPath}" is not an executable file at an absolute path`
      )
    }
    return monoPath
  }

  const candidates = HOST_MONO_PATHS[process.platform] ?? []
  const mono = findExecutable(candidates)
  if (mono == null) {
    throw new InvalidConfigurationError(
      `Building Squirrel.Windows on ${process.platform} requires Mono, which is used only from its install locations${candidates.length === 0 ? "" : ` (${candidates.join(", ")})`}, where it was not found. ` +
        `To use a Mono installed elsewhere, set its absolute path: "squirrelWindows": { "monoPath": "/absolute/path/to/mono" }`
    )
  }
  if (loggedMono !== mono) {
    loggedMono = mono
    log.debug({ path: mono }, "using host Mono")
  }
  return mono
}
