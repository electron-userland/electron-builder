FROM electronuserland/electron-builder:base

# https://github.com/npm/npm/issues/4531
RUN curl -sL https://deb.nodesource.com/setup_6.x | bash - && apt-get install -y nodejs && npm config set unsafe-perm true && apt-get clean && rm -rf /var/lib/apt/lists/*