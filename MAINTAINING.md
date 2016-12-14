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