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
  # sudo for snapcraft (install build packages)
  apt-get -qq install --no-install-recommends git qtbase5-dev bsdtar build-essential autoconf libssl-dev gcc-multilib g++-multilib lzip rpm python libcurl3 git git-lfs ssh unzip \
  apt-get -qq install --no-install-recommends git qtbase5-dev bsdtar build-essential autoconf libssl-dev gcc-multilib g++-multilib lzip rpm python libcurl3 git git-lfs ssh unzip \
  libsecret-1-dev libgnome-keyring-dev \
  libopenjp2-tools \
  # for snap desktop-gtk3 sudo (see https://github.com/ubuntu/snapcraft-desktop-helpers/blob/master/snapcraft.yaml#L189)
  libxkbcommon0 ttf-ubuntu-font-family dmz-cursor-theme light-themes adwaita-icon-theme gnome-themes-standard shared-mime-info libgtk-3-0 libgdk-pixbuf2.0-0 libglib2.0-bin libgtk-3-bin unity-gtk3-module libappindicator3-1 locales-all xdg-user-dirs ibus-gtk3 libibus-1.0-5 \
  # snap build packages
  autotools-dev bsdmainutils debhelper dh-strip-nondeterminism file gettext gettext-base gir1.2-atk-1.0 gir1.2-atspi-2.0 gir1.2-freedesktop gir1.2-gdkpixbuf-2.0 gir1.2-gtk-3.0 gir1.2-pango-1.0 groff-base intltool-debian libarchive-zip-perl libasprintf-dev libasprintf0v5 libatk-bridge2.0-dev libatk1.0-dev libatspi2.0-dev libcairo-script-interpreter2 libcairo2-dev libdbus-1-dev libepoxy-dev libexpat1-dev libfile-stripnondeterminism-perl libfontconfig1-dev libfreetype6-dev libgdk-pixbuf2.0-dev libgettextpo-dev libgettextpo0 libgmp-dev libgmpxx4ldbl libgtk-3-dev libharfbuzz-dev libharfbuzz-gobject0 libharfbuzz-icu0 libice-dev libmail-sendmail-perl libpango1.0-dev libpangoxft-1.0-0 libpipeline1 libpixman-1-dev libpng12-dev libsm-dev libsys-hostname-long-perl libtimedate-perl libunistring0 libxcb-shm0-dev libxcomposite-dev libxcursor-dev libxft-dev libxft2 libxi-dev libxinerama-dev libxrandr-dev libxrender-dev libxtst-dev libxtst6 man-db nettle-dev po-debconf x11proto-composite-dev x11proto-randr-dev x11proto-record-dev x11proto-render-dev x11proto-xinerama-dev && \
  # git-lfs
  git lfs install && \
  # snap
  apt-get -qq install --no-install-recommends jq squashfs-tools && \
  curl -L $(curl -H 'X-Ubuntu-Series: 16' 'https://api.snapcraft.io/api/v1/snaps/details/core' | jq '.download_url' -r) --output core.snap && \
  mkdir -p /snap/core && unsquashfs -d /snap/core/current core.snap && rm core.snap && \
  curl -L $(curl -H 'X-Ubuntu-Series: 16' 'https://api.snapcraft.io/api/v1/snaps/details/snapcraft?channel=edge' | jq '.download_url' -r) --output snapcraft.snap && \
  mkdir -p /snap/snapcraft && unsquashfs -d /snap/snapcraft/current snapcraft.snap && rm snapcraft.snap && \
  mkdir -p /snap/bin && \
  echo "#!/bin/sh" > /usr/bin/snapcraft && \
  echo 'exec $SNAP/usr/bin/python3 $SNAP/bin/snapcraft "$@"' >> /usr/bin/snapcraft && \
  chmod a+x /usr/bin/snapcraft && \
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