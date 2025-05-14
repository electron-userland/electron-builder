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
        await getBinFromUrl("fpm@3.0.2", "fpm-1.16.0-ruby-3.4.3-linux-x86_64.7z", "tFFFOMTbollIwZyit8zMy8dWZo7KS2qmTVBOdEganW0I7AF0rUglQI4UeJ9u9pZlCOMdxDwPpLs3t2BQ+eMjZA=="),
        exec
      )
    }
    return path.join(
      await getBinFromUrl("fpm@3.0.2", "fpm-1.16.0-ruby-3.4.3-linux-i386.7z", "haLMywCXHYQwU2kzXU4MvRdLCC0RBwyZPc/xXe2Olni9KZoRi5/VWaln62YRPAH7G9lZ4Oa4WULg+P4rz08gJA=="),
      exec
    )
  }
  return path.join(
    await getBinFromUrl("fpm@3.0.2", "fpm-1.16.0-ruby-3.4.3-darwin-x86_64.7z", "yTtPSUuLYXvsyR/hDZmf3nwgJrwW7FdkcM/KsDKGcz3Jtp7g3PT/yJX5Ggc+iJUIcM+cPK2FbEvG52vLzLokQg=="),
    exec
  )
}
