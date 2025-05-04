import * as path from "path"
import { getBinFromUrl } from "../binDownload"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromUrl("linux-tools@1.0.1", "linux-tools-mac-10.12.4.7z", "CMiM/6mWOUghHkvgB2PmJdyGoblMdlGD+VBqbxiIea51ExDDe7GrZ82/wBy3KI0d5Wrrkc1Hkd1/lWMcbWUfuA==")
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
        await getBinFromUrl("fpm@2.0.2", "fpm-1.16.0-ruby3.3.0-linux-x64.7z", "RO2SvVHJVpG68dMzsc7s5UkqMGp2UqOHBsDSTKFFOUMN16VXoL1mya4ZvngCXiWQbkeMxQIo3HE1cL3XXe8gXQ=="),
        exec
      )
    }
    return path.join(
      await getBinFromUrl("fpm@2.0.2", "fpm-1.16.0-ruby3.3.0-linux-ia32.7z", "/y2XGooSBvm6DgXuMA/0ucslhJ7mPKk9WBReVKOgmabzJVffuhApZhiCuy4+3d0BQUX1KmIwxAAYmUXVyZ2UJA=="),
      exec
    )
  }
  return path.join(
    await getBinFromUrl("fpm@2.0.2", "fpm-1.16.0-ruby3.3.0-darwin.7z", "+e3KL+cojXmMFja8tipK1yNIaAtOk1DGqNVkoX8fBFI5nv2mHFZInrEfrCRfeDBWCJyOBsSFjTaW/ZHtPAIYTQ=="),
    exec
  )
}
