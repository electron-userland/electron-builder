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
  --config.publish.bucket=test-bucket
```

## 3. Bump the version and test

Update the `version` field in `package.json` to a higher number than the installed app, then install the previously built app and launch it. The updater should detect and apply the update from your local Minio bucket. Logs are written to:

- **Windows:** `%AppData%\Roaming\<appname>\log.log`
- **macOS:** `~/Library/Logs/<appname>/main.log`
- **Linux:** `~/.config/<appname>/log.log`
