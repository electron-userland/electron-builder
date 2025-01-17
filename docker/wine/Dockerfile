ARG IMAGE_VERSION=latest
FROM --platform=linux/x86_64 electronuserland/builder:$IMAGE_VERSION

RUN dpkg --add-architecture i386 && \
  mkdir -pm755 /etc/apt/keyrings && \
  wget -qO /etc/apt/keyrings/winehq-archive.key https://dl.winehq.org/wine-builds/winehq.key && \
  wget -qNP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/debian/dists/bookworm/winehq-bookworm.sources && \
  apt-get update && \
  apt-get install -y --no-install-recommends winehq-stable xvfb \
  && \
  # clean
  apt-get clean && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:0

ENV WINEDEBUG=-all,err+all
ENV WINEDLLOVERRIDES=winemenubuilder.exe=d

RUN xvfb-run winecfg
