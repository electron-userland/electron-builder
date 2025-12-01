import * as path from "path"
import { getBinFromUrl } from "../binDownload"
import { isEmptyOrSpaces } from "builder-util"

const wincodesignChecksums = {
  "rcedit-windows-2_0_0.zip": "DroASjKwzPcqtMqqShxcXlV/lRPh71JZvuL2e04BCl7AhtXtWk0r7G6LFtzHHvVYJ6geRQMY1eP7SxVCVCXK7w==",
  "win-codesign-darwin-arm64.zip": "3nfc9o64Qm4IH5p4RoUbh8enP3S9sZ8bboreomD2BJrOz1UX/DvnXXCP+gUbR625nbKJU42COqxiXbZdflmYzw==",
  "win-codesign-darwin-x86_64.zip": "c9FqPPXl5qGNT9l2Ohiiiq4BGdyM7/0ADPQpNpQR+ePKNXsUi1yLjsPHQB4MLRSRanGnScP14Xdl53UubxNuFQ==",
  "win-codesign-linux-amd64.zip": "GmUJeIXKbvXqXY1LSDgPXZt3uXQ5ZAy/WtpFmR7S6umU+wK6utpekTJHWgRB61IS9FuK0WQvyDYZ+ubM5d43Lw==",
  "win-codesign-linux-arm64.zip": "Jj8tbHvAgyR3GwhzKR+Qi5kgPEMp0Fp9kbFKg8NVhaIWAUlAFqCksgBJedzgb3tAWGUJZ6V4pNs2+IKlq/qrhw==",
  "win-codesign-linux-i386.zip": "Ss/Umbab36/fkj4V+qspCL8nobWlTJStevUtOU2gfS+AfG4GY9Vibib9Ts3d7+YG/vlK+kP7WQ21HY8MH8tQZg==",
  "win-codesign-windows-x64.zip": "+8MK1EBBgJ6ZRfV5+AeYoNJFXTTCak0mqKwvZn9Yhqgw2mP4BLVacwhfi78ILpqLtfZWxJFbg7zU7FHOmisJFA==",
  "windows-kits-bundle-10_0_26100_0.zip": "O3S2154LOJnw8izA2TGRU0s09tn7q7T/C08ARyV5lvnxkdXjbELe4CGtmAk/7XkurOrnVv6wVxDoi/WjOAUMbQ==",
}

// It's just easier to copy the map of checksums here rather then adding them to within each if-statement. Also, easy copy-paste from the releases page
const fpmChecksums = {
  "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z": "0n3BG/Xz1T5YIsoNNTG1bBege9E8A7rym5e3mfzHSHbiSiTS44v6GIHW4amDQk1Y5dtKtWXVq7FwjdmAf3kmMg==",
  "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z": "wPX3UheBznIlAXduM22W/d27i+DZVIB/MYnY5eh/qLeEEASZqHJWgN+pIckz3jT0dP37g1SQCikXXfsgxtMSPA==",
  "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z": "7miGWr6dfJSzXDD9ALqkwxvGACp7s7GR50NPcU0YwzbJL825H1SLwGJSGME+v57BxDI2xac47gFEkRZf5u9EtA==",
  "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z": "moRNjg6Q2iSXpkrm5sGNL2F6KilGNPagbefxhtr3VEqvAUSg2k2pMLr5xXUo0L4rZ4V+uETbwmbDCpeO3pmLyQ==",
  "fpm-1.17.0-ruby-3.4.3-linux-i386.7z": "UPzsXhkW2T7+oHSKgFsZsFUxxmPC9lNZHsQbT+OeoTbIGsb6+qf3m7c6uP0XvRFnJiu3MM3lE1xAWQOctvajWA==",
}

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
  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-amd64.7z"
      } else if (process.arch === "arm64") {
        return "fpm-1.17.0-ruby-3.4.3-linux-arm64v8.7z"
      }
      return "fpm-1.17.0-ruby-3.4.3-linux-i386.7z"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "fpm-1.17.0-ruby-3.4.3-darwin-arm64.7z"
    }
    return "fpm-1.17.0-ruby-3.4.3-darwin-x86_64.7z"
  }

  const filename = getKey()
  const fpmPath = await getBinFromUrl("fpm@2.1.4", filename, fpmChecksums[filename])
  return path.join(fpmPath, exec)
}

export async function getWindowsKitsBundle() {
  const overridePath = process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return overridePath
  }
  const file = "windows-kits-bundle-10_0_26100_0.zip"
  return await getBinFromUrl("win-codesign@1.0.0", file, wincodesignChecksums[file], "mmaietta/electron-builder-binaries")
}

export async function getOsslSigncodeBundle() {
  const overridePath = process.env.ELECTRON_BUILDER_OSSL_SIGNCODE_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return overridePath
  }
  if (process.platform === "win32" || process.env.USE_SYSTEM_OSSLSIGNCODE === "true") {
    return "osslsigncode"
  }

  const getKey = () => {
    if (process.platform === "linux") {
      if (process.arch == "x64") {
        return "win-codesign-linux-amd64.zip"
      } else if (process.arch === "arm64") {
        return "win-codesign-linux-arm64.zip"
      }
      return "win-codesign-linux-i386.zip"
    }
    // darwin arm64
    if (process.arch === "arm64") {
      return "win-codesign-darwin-arm64.zip"
    }
    return "win-codesign-darwin-x86_64.zip"
  }

  const filename = getKey()
  const toolPath = await getBinFromUrl("win-codesign@1.0.0", filename, wincodesignChecksums[filename], "mmaietta/electron-builder-binaries")
  return toolPath
}

export async function getRceditBundle() {
  const overridePath = process.env.ELECTRON_BUILDER_RCEDIT_PATH
  if (!isEmptyOrSpaces(overridePath)) {
    return overridePath
  }
  const file = "rcedit-windows-2_0_0.zip"
  return await getBinFromUrl("win-codesign@1.0.0", file, wincodesignChecksums[file], "mmaietta/electron-builder-binaries")
}
