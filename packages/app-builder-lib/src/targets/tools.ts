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
        await getBinFromUrl("fpm@3.0.1", "fpm-1.16.0-ruby-3.4.3-linux-x86_64.7z", "mrUG/bw3pj3SCWCveXhlh2Nh1aNX8y/ihkuIZ3IYHc9uC64/6ipe/VEs1TtH6CocrxtkszfWVChywFF1OB205Q=="),
        exec
      )
    }
    return path.join(
      await getBinFromUrl("fpm@3.0.1", "fpm-1.16.0-ruby-3.4.3-linux-386.7z", "Uwn8gc08tzkob4Iyve9SPOaAC6O+Z4Mvgc+FyLH9PKbF3M5L/DUlFHSWPHdUgi+4tCK2/RJL9LYJ2ZoeXPBFDQ=="),
      exec
    )
  }
  return path.join(
    await getBinFromUrl("fpm@3.0.1", "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z", "nZlZD+J054OfjKVC0+WXgvrpUaHiyudwsAinJLSmEBlaNqn7QaayTwEA0vg2Mh2x4nzhQRBkSojtl93TV5EA8g=="),
    exec
  )
}
