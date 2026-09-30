---
"electron-publish": major
"builder-util-runtime": minor
"app-builder-lib": patch
---

feat(s3)!: explicit AWS credential sources for S3 publishing via the new `awsCredentials` option (restores shared config / IAM Identity Center profiles, #10054)

- `awsCredentials.source` is required to publish (no default, no implicit credentials).
- `awsCredentials.source: "env"` reads only `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`, or the variable names given in `awsCredentials.env`.
- `awsCredentials.source: "profile"` with `profile` (plus optional `credentialsFile` / `configFile`) reads a named profile from the shared config and credentials files: static keys, IAM Identity Center (SSO), `credential_process` and assume-role. The AWS SDK providers are loaded lazily, only for non-static profiles, and are given explicit paths.
- `awsCredentials.source: "sso-role-chain"` with `profile` resolves an assume-role profile whose `source_profile` chain (up to 5 hops, no cycles) starts at an IAM Identity Center (SSO) profile: the SSO profile is resolved from the configured files, then STS AssumeRole is called per hop with explicit region, endpoint and credentials (never `AWS_REGION`, `AWS_PROFILE` or `AWS_ENDPOINT_URL*`). `credential_source`, `mfa_serial`, web identity and `credential_process` are rejected in the chain. `source: "profile"` keeps rejecting SSO-sourced role chains and points to this source.
- Resolved credentials are reused for every file of a publish instead of being resolved again per upload.

BREAKING CHANGE: S3 publishing fails with an InvalidConfigurationError unless `awsCredentials.source` is set (add `{ "source": "env" }` to keep using `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`). `AWS_PROFILE`, `AWS_SDK_LOAD_CONFIG`, `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE` and an implicit `~/.aws/credentials` are no longer read. Missing credentials now fail with a clear error instead of an unsigned or env-fallback signature. For dotted bucket names without `region`, the region is looked up only when publishing. `awsCredentials` is never written to `app-update.yml`.
