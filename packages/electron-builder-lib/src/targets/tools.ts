import BluebirdPromise from "bluebird-lst"
import { getBinFromGithub } from "builder-util/out/binDownload"
import { Lazy } from "lazy-val"
import * as path from "path"
import { Platform } from "../core"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export function getAppImage() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("appimage", "9.0.3", "jaOGGGXLKjJV4SXajFOoIb7vCq4GbN0ggy5eosd8F0GAh0ythYfZSq9Lj/+uymmw2h3kKf9W8Y2KBnWxIjU0aw==")
}

export const fpmPath = new Lazy(() => {
  if (process.platform === "win32" || process.env.USE_SYSTEM_FPM === "true") {
    return BluebirdPromise.resolve("fpm")
  }

  const osAndArch = process.platform === "darwin" ? "mac" : `linux-x86${process.arch === "ia32" ? "" : "_64"}`

  if (process.platform === "darwin") {
    //noinspection SpellCheckingInspection
    return getBinFromGithub("fpm", "1.9.2.1-20150715-2.2.2-mac", "6sZZoRKkxdmv3a6E5dnZgVl23apGnImhDtGHKhgCE1WOtXBUJnx+w0WvB2HD2/sitz4f93Mf7+QqDCIbfP7LOw==")
      .then(it => path.join(it, "fpm"))
  }

  //noinspection SpellCheckingInspection
  const checksum = process.arch === "ia32" ? "cTT/HdjrQ6qTJQhTZaZC3lyDkRCyNFtNBZ0F7n6mh5B3YmD5ttJZ0xn65pQS03dhEi67A8K1xXNO+tyEEviiIg==" : "0zKxWlHuQEUsXJpWll5Bc4OTI8d0jcMVlme9OeHI+Y+s3sv1S4KyGLOEVEkNw6pRU8F+A1Dj5IR95/+U8YzB0A=="
  return getBinFromGithub("fpm", `1.9.2-2.3.1-${osAndArch}`, checksum)
    .then(it => path.join(it, "fpm"))
})

export function prefetchBuildTools() {
  // yes, we starting to use native Promise
  return Promise.all([getAppImage(), fpmPath.value])
}

export function getZstd() {
  const platform = Platform.current()
  const archQualifier = platform === Platform.MAC ? "" : `-${process.arch}`

  let checksum = ""
  if (platform === Platform.MAC) {
    // noinspection SpellCheckingInspection
    checksum = "Ts8UetZVWz1G1qhzmsw4FlbK9L3sgI3OVYAMffIK0qPy4gxnTSSV7dhvE54SpmhWnfTlELmprbAAJm5zzcqT8w=="
  }
  else if (platform === Platform.WINDOWS) {
    // noinspection SpellCheckingInspection
    checksum = process.arch === "ia32" ?
      "zjMFp++cp6ekMDaKu/SsFlog6cyr5kdgk5x2IvSpB6IsSp0c7bTL2Y58lLpV4qPAL1eagjjoMHi+doOWFSHpzg==" :
      "oTOQout3zX0x/4gcXGcoevs79TqnlY7CQNXXx/cwp2ebj1dgavf8C9R3JvNFKQf/mQ7WcY7+W9vVI2oP7mxbFA=="
  }

  //noinspection SpellCheckingInspection
  return getBinFromGithub(`zstd-${platform.buildConfigurationKey}${archQualifier}`, "1.3.2", checksum)
    .then(it => path.join(it, `zstd${platform === Platform.WINDOWS ? ".exe" : ""}`))
}

export function getAria() {
  const platform = Platform.current()
  const archQualifier = platform === Platform.MAC ? "" : `-${process.arch}`

  let checksum = ""
  if (platform === Platform.MAC) {
    // noinspection SpellCheckingInspection
    checksum = "UjstpQUAtoP/sZ9SNuWwIN1WyDfvr1V3bzLGzTZCt1IqQsf9YwBSo0jrXMMRZOqv1sy5EOvp5nyC4VvJZCRVuQ=="
  }
  else if (platform === Platform.WINDOWS) {
    // noinspection SpellCheckingInspection
    checksum = process.arch === "ia32" ?
      "aulZig14OCHqj5qUWDvIAacibzW9k+gfDGDeECzWDrF7FPYzI+Vn7Q7QnW/FXNyNnbe8PeYawTlGzD3vJxLQWg==" :
      "zksKH0Uazwtc/vfGSVy+tzsNou+thSamAGTKt8P1DLoNkdSz9ueaIFoJ7jt8jlDds8Z6Rrxls6IFkZRBDxiyfg=="
  }

  //noinspection SpellCheckingInspection
  return getBinFromGithub(`aria2-${platform.buildConfigurationKey}${archQualifier}`, "1.33.1", checksum)
    .then(it => path.join(it, `aria2c${platform === Platform.WINDOWS ? ".exe" : ""}`))
}