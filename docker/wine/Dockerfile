FROM electronuserland/electron-builder:latest

RUN dpkg --add-architecture i386 && apt-get update -y && apt-get install -y --no-install-recommends wine32 wine-stable mono-devel ca-certificates-mono && \
apt-get clean && rm -rf /var/lib/apt/lists/*

ENV WINEDEBUG -all,err+all
ENV WINEDLLOVERRIDES winemenubuilder.exe=d

RUN wineboot --init || true