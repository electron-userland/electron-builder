FROM buildpack-deps:xenial-curl

# rpm is required for FPM to build rpm package
# yasm is required to build p7zip
# osslsigncode to sign windows on Linux

RUN apt-get update -y && \
apt-get install --no-install-recommends -y bsdtar build-essential autoconf libssl-dev icnsutils graphicsmagick gcc-multilib g++-multilib libgnome-keyring-dev lzip rpm osslsigncode yasm && \
apt-get clean && \
rm -rf /var/lib/apt/lists/*

RUN set -ex \
  && for key in \
    9554F04D7259F04124DE6B476D5A82AC7E37093B \
    94AE36675C464D64BAFA68DD7434390BDBE9B9C5 \
    0034A06D9D9B0064CE8ADF6BF1747F4AD2306D93 \
    FD3A5288F042B6850C66B31F09FE44734EB7990E \
    71DCFD284A79C3B38668286BC97EC7A07EDE3FC1 \
    DD8F2338BAE7501E3DD5AC78C273792F7D83545D \
    B9AE9905FFD7803F25714661B63B535A4C206CA9 \
    C4F0DFFF4E8C1A8236409D08E73BC641CC11F4C8 \
  ; do \
    gpg --keyserver ha.pool.sks-keyservers.net --recv-keys "$key"; \
  done

ENV NODE_VERSION 6.2.0
ENV XZ_VERSION 5.2.2
# we don't use our bundled 7za because it is better to build for specific platform - not generic
ENV USE_SYSTEM_7ZA true

# https://github.com/npm/npm/issues/4531

# install modern multi-thread xz
# ldconfig - see 4.6. liblzma.so (or similar) not found when running xz
RUN curl -L http://tukaani.org/xz/xz-$XZ_VERSION.tar.xz | tar -xJ && cd xz-$XZ_VERSION && ./configure && make && make install && cd .. && rm -rf xz-$XZ_VERSION && ldconfig && \
  mkdir -p /tmp/7z && curl -L http://downloads.sourceforge.net/project/p7zip/p7zip/15.14.1/p7zip_15.14.1_src_all.tar.bz2 | tar -xj -C /tmp/7z --strip-components 1 && cd /tmp/7z && cp makefile.linux_amd64_asm makefile.machine && make && make install && cd .. && rm -rf /tmp/7z && \
  curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
  && curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt.asc" \
  && gpg --batch --decrypt --output SHASUMS256.txt SHASUMS256.txt.asc \
  && grep " node-v$NODE_VERSION-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
  && tar -xJf "node-v$NODE_VERSION-linux-x64.tar.xz" -C /usr/local --strip-components=1 \
  && rm "node-v$NODE_VERSION-linux-x64.tar.xz" SHASUMS256.txt.asc SHASUMS256.txt \
  && curl -L https://npmjs.org/install.sh | sh && npm cache clean && npm config set unsafe-perm true && npm completion >> ~/.bashrc

COPY test.sh /test.sh

WORKDIR /project

ENV DEBUG_COLORS true
ENV FORCE_COLOR true

# copied from https://github.com/docker-library/ruby/blob/0b94677b368947b64dcdcb312cd81ba946df3676/2.3/Dockerfile

# skip installing gem documentation
RUN mkdir -p /usr/local/etc \
	&& { \
		echo 'install: --no-document'; \
		echo 'update: --no-document'; \
	} >> /usr/local/etc/gemrc

ENV RUBY_MAJOR 2.3
ENV RUBY_VERSION 2.3.1
ENV RUBY_DOWNLOAD_SHA256 b87c738cb2032bf4920fef8e3864dc5cf8eae9d89d8d523ce0236945c5797dcd
ENV RUBYGEMS_VERSION 2.6.4

# some of ruby's build scripts are written in ruby
# we purge this later to make sure our final image uses what we just built
RUN set -ex \
	&& buildDeps=' \
		bison \
		libgdbm-dev \
		ruby \
	' \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends $buildDeps \
	&& rm -rf /var/lib/apt/lists/* \
	&& curl -fSL -o ruby.tar.gz "http://cache.ruby-lang.org/pub/ruby/$RUBY_MAJOR/ruby-$RUBY_VERSION.tar.gz" \
	&& echo "$RUBY_DOWNLOAD_SHA256 *ruby.tar.gz" | sha256sum -c - \
	&& mkdir -p /usr/src/ruby \
	&& tar -xzf ruby.tar.gz -C /usr/src/ruby --strip-components=1 \
	&& rm ruby.tar.gz \
	&& cd /usr/src/ruby \
	&& { echo '#define ENABLE_PATH_CHECK 0'; echo; cat file.c; } > file.c.new && mv file.c.new file.c \
	&& autoconf \
	&& ./configure --disable-install-doc \
	&& make -j"$(nproc)" \
	&& make install \
	&& apt-get purge -y --auto-remove $buildDeps \
	&& gem update --system $RUBYGEMS_VERSION \
	&& rm -r /usr/src/ruby

ENV BUNDLER_VERSION 1.12.4

RUN gem install bundler --version "$BUNDLER_VERSION"

# install things globally, for great justice
# and don't create ".bundle" in all our apps
ENV GEM_HOME /usr/local/bundle
ENV BUNDLE_PATH="$GEM_HOME" \
	BUNDLE_BIN="$GEM_HOME/bin" \
	BUNDLE_SILENCE_ROOT_WARNING=1 \
	BUNDLE_APP_CONFIG="$GEM_HOME"
ENV PATH $BUNDLE_BIN:$PATH
RUN mkdir -p "$GEM_HOME" "$BUNDLE_BIN" \
	&& chmod 777 "$GEM_HOME" "$BUNDLE_BIN" \
  && mkdir -p /tmp/fpm && curl -L https://github.com/jordansissel/fpm/archive/5719990e1bbc3deeaea8a196d6aaa51421a058bd.tar.gz | tar -xz -C /tmp/fpm --strip-components 1 && cd /tmp/fpm && bundle install && make install && cd .. && rm -rf /tmp/fpm

# we don't use our bundled fpm because it is better to build ruby & tools for specific platform - not generic. And easy to maintain (update ruby and so on).
ENV USE_SYSTEM_FPM true

# fix error /usr/local/bundle/gems/fpm-1.5.0/lib/fpm/package/freebsd.rb:72:in `encode': "\xE2" from ASCII-8BIT to UTF-8 (Encoding::UndefinedConversionError)
# http://jaredmarkell.com/docker-and-locales/
# http://askubuntu.com/a/601498
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US:en
ENV LC_ALL en_US.UTF-8