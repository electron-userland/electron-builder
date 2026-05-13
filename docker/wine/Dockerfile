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
  # Wine 9.x+ removed wine64 as a standalone binary; wine on x86_64 is already 64-bit.
  # Symlink for backward compatibility with tools (e.g. electron-winstaller) that still check for wine64.
  ln -sf /usr/bin/wine /usr/bin/wine64 && \
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
# On Apple Silicon / Linux ARM64 cross-builds, Wine aborts under QEMU due to the host/guest page-size mismatch
# (host 16KB vs Wine's expected 4KB). We detect this via the assertion text in stderr rather than getconf
# PAGE_SIZE, because inside the emulated x86_64 container PAGE_SIZE reports 4096 regardless of the host.
RUN wineboot --init 2>/tmp/wb.log; \
  if [ $? -ne 0 ]; then \
    cat /tmp/wb.log >&2; \
    grep -qE "host_page_mask|anon_mmap|qemu" /tmp/wb.log || \
      { echo "ERROR: wineboot failed on native x86_64" >&2; exit 1; }; \
    echo "NOTE: wineboot failed due to QEMU page-size emulation (expected on Apple Silicon/ARM cross-builds)" >&2; \
  fi; \
  rm -f /tmp/wb.log
