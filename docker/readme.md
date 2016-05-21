# Development machine

To build Linux:
```sh
docker run --rm -ti -v `pwd`:/project -v `pwd`/node_modules/.linux:/project/node_modules -v ~/.electron:/root/.electron electronuserland/electron-builder
```

To build windows:
```sh
docker run --rm -ti -v ${PWD}:/project -v ${PWD##*/}-node-modules:/project/node_modules -v ~/.electron:/root/.electron electronuserland/electron-builder:wine
```

Consider using `/test.sh` to install npm dependencies and run tests.

# CI Server

```sh
docker run --rm -v ${PWD}:/project -v ~/.electron:/root/.electron electronuserland/electron-builder:wine /test.sh
```

# Build

```
docker build -t electronuserland/electron-builder docker
docker build -t electronuserland/electron-builder:wine docker/wine
```

Or just `npm run docker-images`

# Notes

* We use [named data volume](https://madcoda.com/2016/03/docker-named-volume-explained/) instead of mounted host directory to store `node_modules` because NPM is unreliable and NPM team [doesn't want to fix it](https://github.com/npm/npm/issues/3565).

  `${PWD##*/}-node-modules` is used as name of data volume — it is your current directory name (e. g. `foo`) and suffix `-node-modules`.

  As downside, you have to manually clear outdated data volumes, use `docker volume rm your-name`.