FROM buildpack-deps:xenial-curl

# rpm is required for FPM to build rpm package

RUN apt-get update -y && \
apt-get install --no-install-recommends -y build-essential icnsutils graphicsmagick gcc-multilib g++-multilib libgnome-keyring-dev zip rpm && \
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

# https://github.com/npm/npm/issues/4531

# install modern multi-thread xz
# ldconfig - see 4.6. liblzma.so (or similar) not found when running xz
RUN curl -L http://tukaani.org/xz/xz-$XZ_VERSION.tar.xz | tar -xJ && cd xz-$XZ_VERSION && ./configure && make && make install && cd .. && rm -rf xz-$XZ_VERSION && ldconfig && \
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