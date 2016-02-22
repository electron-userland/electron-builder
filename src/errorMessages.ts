export const buildIsMissed = `Please specify 'build' configuration in the application package.json ('%s'), at least
      
  build: {
    "app-bundle-id": "your.id",
    "app-category-type": "your.app.category.type",
    "iconUrl": "see https://github.com/develar/electron-builder#in-short",
  }
}

is required.
`

export const authorEmailIsMissed = `Please specify author 'email' in the application package.json ('%s')

See https://docs.npmjs.com/files/package.json#people-fields-author-contributors

It is required to set Linux .deb package maintainer. Or you can set maintainer in the custom linux options. 
(see https://github.com/loopline-systems/electron-builder#distributable-format-configuration).
`