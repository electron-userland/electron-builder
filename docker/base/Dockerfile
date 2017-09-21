FROM buildpack-deps:zesty-curl

# rpm is required for FPM to build rpm package
# yasm is required to build p7zip

# install modern multi-thread xz
# ldconfig - see 4.6. liblzma.so (or similar) not found when running xz

# python for node-gyp

# libsecret-1-0 for keytar

ENV XZ_VERSION 5.2.3

# we don't use our bundled 7za because it is better to build for specific platform - not generic
ENV USE_SYSTEM_7ZA true
ENV USE_SYSTEM_XORRISO true

ENV DEBUG_COLORS true
ENV FORCE_COLOR true
ENV DEBIAN_FRONTEND noninteractive

# locales for locale-gen
RUN curl -L https://yarnpkg.com/latest.tar.gz | tar xvz && mv yarn-* /yarn && \
  apt-get update -y && apt-get install --no-install-recommends -y software-properties-common && \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  add-apt-repository ppa:snappy-dev/tools && apt-get update -y && apt-get upgrade -y && \
  apt-get install --no-install-recommends -y google-chrome-stable libsecret-1-0 locales xvfb git snapcraft qtbase5-dev xorriso bsdtar build-essential autoconf libssl-dev icnsutils libopenjp2-7 graphicsmagick gcc-multilib g++-multilib libgnome-keyring-dev lzip rpm yasm python libcurl3 git ssh && \
  curl -O http://mirrors.kernel.org/ubuntu/pool/universe/libi/libicns/libicns1_0.8.1-3.1_amd64.deb && dpkg --install libicns1_0.8.1-3.1_amd64.deb && unlink libicns1_0.8.1-3.1_amd64.deb && \
  apt-get remove software-properties-common -y && \
  apt-get clean && rm -rf /var/lib/apt/lists/* && \
  curl -L http://tukaani.org/xz/xz-$XZ_VERSION.tar.xz | tar -xJ && cd xz-$XZ_VERSION && ./configure && make && make install && cd .. && rm -rf xz-$XZ_VERSION && ldconfig && \
  mkdir -p /tmp/7z && curl -L http://downloads.sourceforge.net/project/p7zip/p7zip/16.02/p7zip_16.02_src_all.tar.bz2 | tar -xj -C /tmp/7z --strip-components 1 && cd /tmp/7z && cp makefile.linux_amd64_asm makefile.machine && make && make install && rm -rf /tmp/7z

COPY test.sh /test.sh

WORKDIR /project

# fix error /usr/local/bundle/gems/fpm-1.5.0/lib/fpm/package/freebsd.rb:72:in `encode': "\xE2" from ASCII-8BIT to UTF-8 (Encoding::UndefinedConversionError)
# http://jaredmarkell.com/docker-and-locales/
# http://askubuntu.com/a/601498
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8
ENV PATH "/yarn/bin:$PATH"