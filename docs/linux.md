# Creating installers for Linux

If you're on OS X/Linux and want to build `.deb` packages, you need fpm installed. Please check [fpm repo](https://github.com/jordansissel/fpm) for installation instructions.

## Command

```
$ electron-builder dist/win/someFancy-linux-x64 --platform=linux --out=/some/path/ --config=config.json
```

### Parameters

### `linux.arch`
Define architecture, be it `32` or `64`.

### `linux.target`
Define package type, it must be `deb` (support for `rpm` is coming).

### `linux.version`
Version of your application.

### `linux.title`
Define the name of the app.

### `linux.comment`
Define a comment about the app.

### `linux.executable`
Define the executable of the app.

### `linux.maintainer`
Define the maintainer of the app. Must be with the following format : `Name <email@example.com>`
