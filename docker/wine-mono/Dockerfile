ARG IMAGE_VERSION=wine
FROM electronuserland/builder:$IMAGE_VERSION

# since mono is required only for deprecated target Squirrel.Windows, extracted to separate docker image to reduce size

RUN apt-get update -y && \
  apt-get install -y --no-install-recommends mono-devel ca-certificates-mono && \
  apt-get clean && rm -rf /var/lib/apt/lists/*
