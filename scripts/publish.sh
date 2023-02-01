#!/usr/bin/env bash
set -e

# netlify-cli can be used to publish directory directly without intermediate git repository,
# but it will complicate deployment because in this case you need to be authenticated on Netlify.
# But for what, if you are already configure Git access?
# Also, this approach allows us to manage access using GitHub and easily give access to publish to project members.

# https://stackoverflow.com/questions/3311774/how-to-convert-existing-non-empty-directory-into-a-git-working-directory-and-pus

cd site

mkdir sponsor-logos || true
cp ../scripts/sponsor-logos/*.svg sponsor-logos/

# do not use force push - netlify doesn't trigger deploy for forced push
git clone --no-checkout --branch en --single-branch git@github.com:develar/generated-gitbook-electron-builder.git ./repo.tmp
mv ./repo.tmp/.git ./
rmdir ./repo.tmp
git add --all .
git commit -m "update"
git push