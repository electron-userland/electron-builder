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
        await getBinFromUrl("fpm@3.0.3", "fpm-1.16.0-ruby-3.4.3-linux-x86_64.7z", "EaXIdzy3eeZc9a5kUBYWpwZb6aoh1A7WvAqKq1xs+r8T/dfnLUya0MxT6pBa+RyLS/gSHGvMeTfMzdff5luKFA=="),
        exec
      )
    }
    return path.join(
      await getBinFromUrl("fpm@3.0.3", "fpm-1.16.0-ruby-3.4.3-linux-i386.7z", "buwdccfjjsvsAop1Z4fCeXVd2slraSeO+CdRWT+jlc6mbD8DJv1oXRsgAAG91JcRX6KoPFMouuypqrUu/18q5Q=="),
      exec
    )
  }
  return path.join(
    await getBinFromUrl("fpm@3.0.3", "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z", "yTne5+joWDnmb2p1r2i9uWT7k8NkRr//Nh3Dh754Nb/RbmLDOB3YAnW6j8bykwoQA9AElWOEuH7ZdF2QZ1PETA=="),
    exec
  )
}
