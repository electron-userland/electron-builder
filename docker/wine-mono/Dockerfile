ARG IMAGE_VERSION=wine
FROM --platform=linux/x86_64 electronuserland/builder:$IMAGE_VERSION

# since mono is required only for deprecated target Squirrel.Windows, extracted to separate docker image to reduce size

RUN apt-get -qq update -y && \
  apt-get -qq install -y --no-install-recommends mono-devel ca-certificates-mono && \
  apt-get clean && rm -rf /var/lib/apt/lists/*
