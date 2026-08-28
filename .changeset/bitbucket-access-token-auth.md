---
"electron-publish": minor
---

fix(publish): authenticate Bitbucket Cloud uploads with access tokens (Bearer auth)

Bitbucket Cloud is deprecating app passwords (https://www.atlassian.com/blog/bitbucket/bitbucket-cloud-transitions-to-api-tokens). The Bitbucket publisher now selects the auth scheme by whether a username is set: with a username it sends HTTP Basic auth (Bitbucket username + app password, or Atlassian account email + API token); without a username it sends the token as a repository/project/workspace access token via `Authorization: Bearer`. Previously a token was always sent as Basic auth using the repo owner as the username, so access tokens could not be used.
