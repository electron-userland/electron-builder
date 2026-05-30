ARG IMAGE_VERSION=wine
FROM --platform=linux/x86_64 electronuserland/builder:$IMAGE_VERSION

# since mono is required only for deprecated target Squirrel.Windows, extracted to separate docker image to reduce size

RUN apt-get -qq update -y && \
  # Under QEMU (Apple Silicon cross-builds), the Mono CA cert post-install hook invokes
  # /usr/bin/mono which crashes with a JIT assertion (x86-codegen.h offset check). Divert
  # the path so the real binary lands at a temporary name; place /bin/true as a no-op for
  # the hook; then restore the real binary after installation completes.
  dpkg-divert --divert /usr/bin/mono.qemu-workaround --rename /usr/bin/mono && \
  ln -sf /bin/true /usr/bin/mono && \
  apt-get -qq install -y --no-install-recommends mono-devel && \
  rm -f /usr/bin/mono && \
  dpkg-divert --remove --rename /usr/bin/mono && \
  apt-get clean && rm -rf /var/lib/apt/lists/*
