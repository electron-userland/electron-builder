# Publishing to NPM
We use [semantic-release](https://github.com/semantic-release/semantic-release) to fully automate package publishing.
Every successful continuous integration build of the master branch is analyzed and
new version with tag `next` will be published if `fix`, `feat` or `BREAKING CHANGE` [detected](https://github.com/semantic-release/semantic-release#patch-release).

# Sync wiki
To add `wiki` upstream:
```
git remote add wiki git@github.com:electron-userland/electron-builder.wiki.git
```

To sync: `yarn update-wiki`

# Typings

All typings are added into root `package.json` to avoid duplication errors in the IDE compiler (several `node.d.ts` files).

# ^ or ~ for package depdencies?

For `electron-builder-http` `~` is used because if something fixed in this module, all clients should be updated as well (to ensure, that client will get update versions).

For `builder-util` `^` is used, because often new methods are added to this module, and if `~` will be used, we will be forced to release dependent packages very often and it can create unnecessary noise.