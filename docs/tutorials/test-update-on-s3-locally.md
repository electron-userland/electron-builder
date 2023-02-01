# Description
Auto updates is one of the most critical pieces of any application and testing that process is important.

This page is intended to explain how to test the auto update process locally.

Much of the update steps were copied from [here](https://github.com/electron-userland/electron-builder/issues/3053)


# Steps
## 1. Download and Install Minio
Minio is a locally runnable server that implements the S3 protocol.  https://min.io/download

Download the server and the client and put them in a directory you want.  For this document we'll refer to this directory as `minio-home`

Your directory should look like this
```
minio-home
├── minio.exe
└── mc.exe
```

## 2. Create and Configure a Bucket

Run the following in `minio-home`
```sh
mkdir ./minio-data
mkdir ./minio-data/test-bucket
```
Then you can run `./minio.exe server ./minio-data` to start the server.

This will start the server with the default credentials _(i.e. **minioadmin**)_

Access the web client at http://127.0.0.1:9000 - you should be able to access with the default credentials.

At this point you should add a read policy on the bucket.  You can do this by accessing the web client, going to the bucket settings, and adding a `*` `Read Only` policy.  
> This is necessary for the updater to have access to the updates.
{.is-info}

## 3. Publish the Updates
First build the application once so we don't have to wait for a build every time.  To do this run your compilation step first.

Then  ensure  your `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables  are set. You can set them in your terminal session or your IDE such as Webstorm or you can include them with [dotenv](https://www.npmjs.com/package/dotenv) and then have `require("dotenv").config()` at the top of your configuration file (if it's a javascript file).

Once you've set the env variables you can run your publish command with a modification. 
For example you have a command named `publish:prod` which is `electron-builder --x64 --config configs/electron-builder.js`, 

You would make `publish:dev` which is `yarn publish:prod --publish always  --config.publish.provider=s3 --config.publish.endpoint=http://localhost:9000 --config.publish.bucket=test-update`

This will automatically override the publish configurations and run the publish process.

Then go into your `package.json` file and update the version number to something **higher** than the current version.  This is important for a new update to be detected.

If you go to the web client now you should see the executable, corresponding blockmap, and a `latest.yml` file.


## 4. Install and Test

Now you want to install the built application. It should exist whatever directory you specified in your config as the out directory _(or the default which is `dist`)_

Start the application and check the log output.  In windows it should be in this directory: `%AppData%\Roaming\yourapp\log.log` This will contain the updater logs and indicate how far or at what step the update fails if it does.  

If your update flow is correct then you should see an update notification as normal.


