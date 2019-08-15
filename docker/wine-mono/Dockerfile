FROM electronuserland/builder:wine

# since mono is required only for deprecated target Squirrel.Windows, extracted to separate docker image to reduce size

RUN apt-get update -y && \
  apt-get install -y --no-install-recommends mono-devel ca-certificates-mono tzdata && \
  apt-get clean && rm -rf /var/lib/apt/lists/*