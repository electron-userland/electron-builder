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
        await getBinFromUrl("fpm@3.0.4", "fpm-1.16.0-ruby-3.4.3-linux-x86_64.7z", "+A2XTFx/+ubWiKUBk8TBlZritbs0gSTYdXgE5pkOT9zMFW5/lq63qY9mPAZ06K8Z//+z1ddxb8O3qYBzf7PKoQ=="),
        exec
      )
    }
    return path.join(
      await getBinFromUrl("fpm@3.0.4", "fpm-1.16.0-ruby-3.4.3-linux-i386.7z", "+JlRlhWSuL/8Sm9w4cfMObzjLs7qvISXBPC9qz90YccZ9u8tqORmLD1FRT59OI0tTmNoCrFUzcVk6NkTNmuauQ=="),
      exec
    )
  }
  return path.join(
    await getBinFromUrl("fpm@3.0.4", "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z", "LAe6C1jjMFSCqUIBt/9SoqAoXaEN19up08rISACbgBfeBU8sL2nnkCur1AbiUcAcliNymfdXbTiueLb3bkHprw=="),
    exec
  )
}
