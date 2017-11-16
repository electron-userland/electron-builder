import { getBinFromGithub } from "builder-util/out/binDownload"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export function getAppImage() {
  return getBinFromGithub("appimage", "9.0.2", "9Y6o5svZhJMeiVCuzy8PmKk0aERoX7LdqssBkiV/oglwGFvKdR2UK0jCJv5+cU5ZRwheq04npiRJ71qMBGVLIA==")
}