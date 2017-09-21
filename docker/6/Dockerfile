FROM electronuserland/builder:base

RUN curl -sL https://deb.nodesource.com/setup_6.x | bash - && apt-get install -y nodejs && \
  # https://github.com/npm/npm/issues/4531
  npm config set unsafe-perm true && \
  # clean
  apt-get clean && rm -rf /var/lib/apt/lists/*