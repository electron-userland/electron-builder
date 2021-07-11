FROM electronuserland/builder:latest

RUN dpkg --add-architecture i386 && \
  curl -Lo /usr/share/keyrings/winehq.asc https://dl.winehq.org/wine-builds/winehq.key && \
  echo 'deb [signed-by=/usr/share/keyrings/winehq.asc] https://dl.winehq.org/wine-builds/ubuntu/ focal main' > /etc/apt/sources.list.d/winehq.list && \
  apt-get update && \
  apt-get install -y --no-install-recommends winehq-stable && \
  # clean
  apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/electron-userland/electron-builder-binaries/releases/download/wine-2.0.3-mac-10.13/wine-home.zip > /tmp/wine-home.zip && unzip /tmp/wine-home.zip -d /root/.wine && unlink /tmp/wine-home.zip

ENV WINEDEBUG -all,err+all
ENV WINEDLLOVERRIDES winemenubuilder.exe=d
