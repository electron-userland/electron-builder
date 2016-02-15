declare module "gh-release" {
  interface Release {
    id: number
    tag_name: string

    draft: boolean

    upload_url: string
  }

  interface Asset {
    id: number
    name: string
  }
}