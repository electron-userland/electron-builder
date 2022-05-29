FROM electronuserland/builder:base

ARG NODE_VERSION 14.19.3

# this package is used for snapcraft and we should not clear apt list - to avoid apt-get update during snap build
RUN curl -L https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz | tar xz -C /usr/local --strip-components=1 && \
  unlink /usr/local/CHANGELOG.md && unlink /usr/local/LICENSE && unlink /usr/local/README.md && \
  # https://github.com/npm/npm/issues/4531
  npm config set unsafe-perm true
RUN npm i -g pnpm@7.1.6
