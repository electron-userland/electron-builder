FROM buildpack-deps:xenial-curl

ENV DEBIAN_FRONTEND noninteractive

RUN curl -L https://yarnpkg.com/latest.tar.gz | tar xvz && mv yarn-* /yarn && ln -s /yarn/bin/yarn /usr/bin/yarn && \
  apt-get -qq update && apt-get -qq dist-upgrade && \
  # add repo for git-lfs
  curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | bash && \
  # git ssh for using as docker image on CircleCI
  # python for node-gyp
  # rpm is required for FPM to build rpm package
  # libsecret-1-0 and libgnome-keyring-dev are required even for prebuild keytar
  # libgtk2.0-dev for snap desktop-gtk2 (see https://github.com/ubuntu/snapcraft-desktop-helpers/blob/master/snapcraft.yaml#L248)
  apt-get -qq install --no-install-recommends git qtbase5-dev bsdtar build-essential autoconf libssl-dev gcc-multilib g++-multilib lzip rpm python libcurl3 git git-lfs ssh unzip \
  libsecret-1-0 libgnome-keyring-dev \
  libopenjp2-tools \
  libgtk2.0-dev && \
  # git-lfs
  git lfs install && \
  # snap
  apt-get -qq install --no-install-recommends jq squashfs-tools && \
  curl -L $(curl -H 'X-Ubuntu-Series: 16' 'https://api.snapcraft.io/api/v1/snaps/details/core' | jq '.download_url' -r) --output core.snap && \
  mkdir -p /snap/core && unsquashfs -d /snap/core/current core.snap && rm core.snap && \
  curl -L $(curl -H 'X-Ubuntu-Series: 16' 'https://api.snapcraft.io/api/v1/snaps/details/snapcraft?channel=edge' | jq '.download_url' -r) --output snapcraft.snap && \
  mkdir -p /snap/snapcraft && unsquashfs -d /snap/snapcraft/current snapcraft.snap && rm snapcraft.snap && \
  mkdir -p /snap/bin && \
  echo "#!/bin/sh" > /snap/bin/snapcraft && \
  echo 'exec $SNAP/usr/bin/python3 $SNAP/bin/snapcraft "$@"' >> /snap/bin/snapcraft && \
  chmod a+x /snap/bin/snapcraft && \
  apt-get -qq purge jq squashfs-tools && \
  rm -rf /var/lib/apt/lists/*

COPY test.sh /test.sh

WORKDIR /project

# fix error /usr/local/bundle/gems/fpm-1.5.0/lib/fpm/package/freebsd.rb:72:in `encode': "\xE2" from ASCII-8BIT to UTF-8 (Encoding::UndefinedConversionError)
# http://jaredmarkell.com/docker-and-locales/
# http://askubuntu.com/a/601498
ENV LANG C.UTF-8
ENV LANGUAGE C.UTF-8
ENV LC_ALL C.UTF-8

ENV USE_UNZIP true

ENV DEBUG_COLORS true
ENV FORCE_COLOR true

ENV SNAP=/snap/snapcraft/current
ENV SNAP_ARCH=amd64
ENV SNAP_NAME=snapcraft
ENV SNAP_VERSION=edge
ENV PATH=/snap/bin:$PATH