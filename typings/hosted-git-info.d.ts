declare module "hosted-git-info" {
  interface Info {
    type: string
    domain: string
    user: string
    project: string
  }

  function fromUrl(url: string): Info
}