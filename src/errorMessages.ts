export const buildIsMissed = `Please specify 'build' configuration in the development package.json ('%s'), at least

  build: {
    "appId": "your.id",
    "category": "your.app.category.type"
  }
}

is required.
`

export const authorEmailIsMissed = `Please specify author 'email' in the application package.json

See https://docs.npmjs.com/files/package.json#people-fields-author-contributors

It is required to set Linux .deb package maintainer. Or you can set maintainer in the custom linux options.
(see https://github.com/electron-userland/electron-builder#distributable-format-configuration).
`

export const buildInAppSpecified = `'build' in the application package.json ('%s') is not supported since 3.0 anymore

Please move 'build' into the development package.json ('%s')
`

export const nameInBuildSpecified = `'name' in the 'build' is forbidden

Please move 'name' from 'build' into the application package.json ('%s')
`