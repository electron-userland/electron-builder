FROM buildpack-deps:xenial-curl

ENV DEBIAN_FRONTEND noninteractive

RUN curl -L https://yarnpkg.com/latest.tar.gz | tar xvz && mv yarn-* /yarn && ln -s /yarn/bin/yarn /usr/bin/yarn && \
  apt-get update -y && \
  # add repo for git-lfs
  curl -s https://packagecloud.io/install/repositories/github/git-lfs/script.deb.sh | bash && \
  # locales for locale-gen, libsecret-1-0 for keytar
  # git ssh for using as docker image on CircleCI
  # python for node-gyp
  # yasm is required to build p7zip
  # rpm is required for FPM to build rpm package
  # libpng16-16 is required for libicns1_0.8.1-3.1 (on xenial)
  apt-get install --no-install-recommends -y libsecret-1-0 locales git snapcraft qtbase5-dev bsdtar build-essential autoconf libssl-dev icnsutils libopenjp2-7 graphicsmagick gcc-multilib g++-multilib libgnome-keyring-dev lzip rpm yasm python libcurl3 git git-lfs ssh libpng16-16 unzip && \
  # libicns
  curl -O http://mirrors.kernel.org/ubuntu/pool/universe/libi/libicns/libicns1_0.8.1-3.1_amd64.deb && dpkg --install libicns1_0.8.1-3.1_amd64.deb && unlink libicns1_0.8.1-3.1_amd64.deb && \
  git lfs install && \
  # we don't use our bundled 7za because it is better to build for specific platform - not generic
  mkdir -p /tmp/7z && curl -L http://downloads.sourceforge.net/project/p7zip/p7zip/16.02/p7zip_16.02_src_all.tar.bz2 | tar -xj -C /tmp/7z --strip-components 1 && cd /tmp/7z && cp makefile.linux_amd64_asm makefile.machine && make -j2 && make install && rm -rf /tmp/7z && rm -rf /usr/local/share/doc/p7zip && \
  # clean
  apt-get clean && rm -rf /var/lib/apt/lists/*

COPY test.sh /test.sh

WORKDIR /project

# fix error /usr/local/bundle/gems/fpm-1.5.0/lib/fpm/package/freebsd.rb:72:in `encode': "\xE2" from ASCII-8BIT to UTF-8 (Encoding::UndefinedConversionError)
# http://jaredmarkell.com/docker-and-locales/
# http://askubuntu.com/a/601498
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8

ENV USE_SYSTEM_7ZA true
ENV USE_UNZIP true

ENV DEBUG_COLORS true
ENV FORCE_COLOR true