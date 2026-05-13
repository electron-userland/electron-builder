ARG IMAGE_VERSION=latest
FROM --platform=linux/x86_64 electronuserland/builder:$IMAGE_VERSION

RUN dpkg --add-architecture i386 && \
  mkdir -pm755 /etc/apt/keyrings && \
  # wine
  # https://gitlab.winehq.org/wine/wine/-/wikis/Debian-Ubuntu#install-wine
  wget -O - https://dl.winehq.org/wine-builds/winehq.key | gpg --dearmor -o /etc/apt/keyrings/winehq-archive.key - && \
  wget -NP /etc/apt/sources.list.d/ https://dl.winehq.org/wine-builds/ubuntu/dists/jammy/winehq-jammy.sources && \
  apt-get -qq update && \
  apt-get -qq install -y --install-recommends winehq-stable && \
  # powershell
  # https://learn.microsoft.com/en-us/powershell/scripting/install/install-ubuntu?view=powershell-7.4
  apt-get install -yq apt-transport-https software-properties-common && \
  wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb && \
  dpkg -i packages-microsoft-prod.deb && \
  rm packages-microsoft-prod.deb && \
  apt-get -qq update && \
  apt-get install -y powershell && \
  # clean
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

ENV WINEDEBUG=-all,err+all
ENV WINEDLLOVERRIDES=winemenubuilder.exe=d

# wineboot --init is the correct headless prefix initialiser (no display needed, exits after init).
# On ARM64/Apple Silicon, Wine SIGABRT under QEMU (16KB host pages vs 4KB Wine expectation). The page-size
# check gates the tolerance: ≠4096 means QEMU/Apple Silicon → skip; =4096 means native x86_64 → fail the build.
RUN wineboot --init || [ "$(getconf PAGE_SIZE)" -ne 4096 ] || { echo "ERROR: wineboot failed on native x86_64" >&2 && false; }
