# Testing Auto-Update Locally with Minio

[Minio](https://min.io/) is a locally runnable server that implements the S3 protocol — useful for testing electron-builder's S3 publish provider without a real AWS account.

## 1. Set up Minio

Download and start Minio following the [Minio quickstart](https://min.io/docs/minio/linux/operations/install-deploy-manage/deploy-minio-single-node-single-drive.html). Create a bucket and set a public read policy on it so electron-updater can access the artifacts.

## 2. Publish to local Minio

Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to your Minio credentials, then publish with overridden S3 config:

```bash
electron-builder --publish always \
  --config.publish.provider=s3 \
  --config.publish.endpoint=http://localhost:9000 \
  --config.publish.bucket=test-bucket \
  --config.publish.awsCredentials.source=env
```

electron-updater accepts a plain `http` feed with no opt-in only on a loopback host (`localhost`, `127.0.0.0/8`, `::1`), as here. To test from another machine (a LAN host or a VM), Minio is not loopback:

- serve Minio over `https` with a certificate that machine trusts, e.g. made with [mkcert](https://github.com/FiloSottile/mkcert) (its root CA installed on that machine). An installed test build is packaged, so it needs this.
- or, in a dev run, set `autoUpdater.allowInsecureFeed = !app.isPackaged` (see [`allowInsecureFeed`](../features/auto-update.md#allowinsecurefeed)).

Minio must not redirect an `https` request to `http`: electron-updater rejects that redirect with `ERR_UPDATER_INSECURE_FEED`.

Set [`autoUpdater.crossOriginHeaders`](../features/auto-update.md#crossoriginheaders) in the app (e.g. `() => []`) before checking, in dev runs too. See [Testing against a local update server](../features/auto-update.md#local-update-server).

## 3. Bump the version and test

Update the `version` field in `package.json` to a higher number than the installed app, then install the previously built app and launch it. The updater should detect and apply the update from your local Minio bucket. Logs are written to:

- **Windows:** `%AppData%\Roaming\<appname>\log.log`
- **macOS:** `~/Library/Logs/<appname>/main.log`
- **Linux:** `~/.config/<appname>/log.log`
