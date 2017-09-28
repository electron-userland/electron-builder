It is developer documentation. See [user documentation](https://www.electron.build/multi-platform-build#docker).

# Build

`yarn docker-images`

# Notes

* We use [named data volume](https://madcoda.com/2016/03/docker-named-volume-explained/) instead of mounted host directory to store `node_modules` because NPM is unreliable and NPM team [doesn't want to fix it](https://github.com/npm/npm/issues/3565).

  `${PWD##*/}-node-modules` is used as name of data volume — it is your current directory name (e. g. `foo`) and suffix `-node-modules`.

  As downside, you have to manually clear outdated data volumes, use `docker volume rm your-name`.