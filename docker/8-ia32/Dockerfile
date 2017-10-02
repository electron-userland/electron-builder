FROM i386/ubuntu:trusty

RUN apt-get update \
&& apt-get install -y --no-install-recommends curl ca-certificates curl software-properties-common \
&& add-apt-repository ppa:ubuntu-toolchain-r/test \
&& apt-get update \
&& apt-get install -y build-essential gnome-keyring libsecret-1-dev python-gnomekeyring clang \
&& curl -L https://yarnpkg.com/latest.tar.gz | tar xvz && mv yarn-* /yarn \
&& curl -sL https://deb.nodesource.com/setup_8.x | bash - && apt-get install -y nodejs && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH "/yarn/bin:$PATH"
ENV CC=clang
ENV CXX=clang++
ENV npm_config_clang=1
