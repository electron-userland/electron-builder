FROM buildpack-deps:xenial-curl

ENV DEBIAN_FRONTEND noninteractive

RUN curl -L https://yarnpkg.com/latest.tar.gz | tar xvz && mv yarn-* /yarn && ln -s /yarn/bin/yarn /usr/bin/yarn && \
  apt-get update -y && \
  # add repo for git-lfs
  curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | bash && \
  # libsecret-1-0 for keytar
  # git ssh for using as docker image on CircleCI
  # python for node-gyp
  # rpm is required for FPM to build rpm package
  # libpng16-16 is required for libicns1_0.8.1-3.1 (on xenial)
  # libgtk2.0-dev for snap desktop-gtk2 (see https://github.com/ubuntu/snapcraft-desktop-helpers/blob/master/snapcraft.yaml#L248)
  apt-get install --no-install-recommends -y libsecret-1-0 git snapcraft qtbase5-dev bsdtar build-essential autoconf libssl-dev icnsutils libopenjp2-7 graphicsmagick gcc-multilib g++-multilib libgnome-keyring-dev lzip rpm python libcurl3 git git-lfs ssh libpng16-16 unzip libgtk2.0-dev && \
  # libicns
  curl -O http://mirrors.kernel.org/ubuntu/pool/universe/libi/libicns/libicns1_0.8.1-3.1_amd64.deb && dpkg --install libicns1_0.8.1-3.1_amd64.deb && unlink libicns1_0.8.1-3.1_amd64.deb && \
  git lfs install && \
  # clean
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
