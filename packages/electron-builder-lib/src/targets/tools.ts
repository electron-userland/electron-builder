import { getBinFromGithub } from "builder-util/out/binDownload"

export function getLinuxToolsPath() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("linux-tools", "mac-10.12.3", "SQ8fqIRVXuQVWnVgaMTDWyf2TLAJjJYw3tRSqQJECmgF6qdM7Kogfa6KD49RbGzzMYIFca9Uw3MdsxzOPRWcYw==")
}

export function getAppImage() {
  //noinspection SpellCheckingInspection
  return getBinFromGithub("appimage", "9.0.3", "jaOGGGXLKjJV4SXajFOoIb7vCq4GbN0ggy5eosd8F0GAh0ythYfZSq9Lj/+uymmw2h3kKf9W8Y2KBnWxIjU0aw==")
}