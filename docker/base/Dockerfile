# hardcoding `--platform` with a constant throws a warning during build.
# That's OK as this image can't be built on arm64 machines due to gcc-multilib & g++-multilib only provided for x64
FROM --platform=linux/x86_64 buildpack-deps:22.04-curl

ENV DEBIAN_FRONTEND=noninteractive

RUN curl -L https://yarnpkg.com/latest.tar.gz | tar xvz && mv yarn-* /yarn && ln -s /yarn/bin/yarn /usr/bin/yarn
RUN apt-get update -yqq && apt-get -qq dist-upgrade && \
  # add repo for git-lfs
  curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | bash && \
  # git ssh for using as docker image on CircleCI
  # python for node-gyp
  # rpm is required for FPM to build rpm package
  # libsecret-1-dev is required even for prebuild keytar (https://atom.github.io/node-keytar/)
  apt-get -qq install --no-install-recommends \
        qtbase5-dev build-essential autoconf libssl-dev gcc-multilib g++-multilib \
        lzip rpm python2 python3 libcurl4 git git-lfs ssh unzip libarchive-tools \
        libxtst6 libsecret-1-dev libopenjp2-tools liblzo2-2 \
  && \
  # git-lfs
  git lfs install && \
  apt-get purge -y --auto-remove && rm -rf /var/lib/apt/lists/*

# Resolves the following error due to dependency requirements
# /root/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/linux/osslsigncode: error while loading shared libraries: libcrypto.so.1.1: cannot open shared object file: No such file or directory
# The missing libcrypto.so.1.1 is part of libssl1.1 but Ubuntu 22.04 upgraded to libssl3, so we must install it manually.
# Note: The libssl1.1_1.1.1f-1ubuntuXXXXX.deb asset occasionally is removed from the "pool" when a new version is released.
# To identify the new version number, go to http://security.ubuntu.com/ubuntu/pool/main/o/openssl and search for `libssl1.1_` to update this var accordingly.
ARG LIB_SSL1_VERSION=2.24
RUN wget -q "http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu${LIB_SSL1_VERSION}_amd64.deb" && \
  dpkg -i libssl1.1*.deb && \
  rm libssl1.1*.deb

COPY ./test.sh /test.sh

WORKDIR /project

# fix error /usr/local/bundle/gems/fpm-1.5.0/lib/fpm/package/freebsd.rb:72:in `encode': "\xE2" from ASCII-8BIT to UTF-8 (Encoding::UndefinedConversionError)
# http://jaredmarkell.com/docker-and-locales/
# http://askubuntu.com/a/601498
ENV LANG=C.UTF-8
ENV LANGUAGE=C.UTF-8
ENV LC_ALL=C.UTF-8

ENV DEBUG_COLORS=true
ENV FORCE_COLOR=true
