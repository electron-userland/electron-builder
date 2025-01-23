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

# We expect this to error in the logs due to no screen display, but it seems to be the only way to init a ~/.wine config dir
# Note: We could run this via xvfb-run, but since `winecfg` is a GUI config tool, the docker build process hangs as the process never exits
RUN winecfg
