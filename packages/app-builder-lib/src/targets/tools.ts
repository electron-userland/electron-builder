import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  return getBinFromUrl("linux-tools-mac-10.12.3", "linux-tools-mac-10.12.3.7z", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export async function getFpmPath() {
  if (process.env.CUSTOM_FPM_PATH != null) {
    return path.resolve(process.env.CUSTOM_FPM_PATH)
  }
  const exec = "fpm"
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return exec
  }
  if (process.platform === "linux") {
    if (process.arch == "x64") {
      return path.join(
        await getBinFromUrl("fpm@2.0.0", "fpm-1.16.0-ruby-3.4.3-linux-x86_64.7z", "ItWjEqdl1WKMZyKqDgxcw1FTgw3OmdLCj50J4r4JipqD9Jhd4RlhCR5JZbrIqwRE+/9U9ntjopWVa2j/rkXnIw=="),
        exec
      )
    } else if (process.arch === "arm64") {
      return path.join(
        await getBinFromUrl("fpm@2.0.0", "fpm-1.16.0-ruby-3.4.3-linux-arm64v8.7z", "WkB5mAA9FBpRUCUdSIaAYrZ4lU7fbeHSKuVM4LLXMwu27l65GVrH28jEiZ+yDxopAWNkcmAfCnG35dFVArB9gw=="),
        exec
      )
    }
    return path.join(
      await getBinFromUrl("fpm@2.0.0", "fpm-1.16.0-ruby-3.4.3-linux-i386.7z", "yo8oNV2FIC0OryQeulBkPto3SIar6qVuV0lNEFUy55w+wZwvp/x6t/Ng/WnWRybRUXzCBEkgCdTRLvyMlSvUXw=="),
      exec
    )
  }
  // darwin arm64
  if (process.arch === "arm64") {
    return path.join(
      await getBinFromUrl("fpm@2.0.0", "fpm-1.16.0-ruby-3.4.3-darwin-arm64.7z", "BuXMS1zmoSgjd6RG0s74bX0TvybKuLNMPvHsutbr9enVYUDmz7MRd8YI5goCFqtPGOvbvWKYGA9RnXzWH4ALKg=="),
      exec
    )
  }
  // darwin x64
  return path.join(
    await getBinFromUrl("fpm@2.0.0", "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z", "g4KD+DZTAsmobs/huNhOxKEmaMv1R+PfgRFwWuJu1Sla/c6h4q2YAtICuukaX9goPguFYkfYd7AUb1hllVxyjQ=="),
    exec
  )
}
