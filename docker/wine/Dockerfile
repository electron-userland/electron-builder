FROM electronuserland/builder:latest

RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common && dpkg --add-architecture i386 && curl -L https://dl.winehq.org/wine-builds/Release.key > Release.key && apt-key add Release.key && apt-add-repository https://dl.winehq.org/wine-builds/ubuntu && \
  apt-get update && \
  apt-get -y remove software-properties-common libdbus-glib-1-2 python3-dbus python3-gi python3-pycurl python3-software-properties && \
  apt-get install -y --no-install-recommends winehq-stable && \
  # clean
  apt-get clean && rm -rf /var/lib/apt/lists/* && unlink Release.key

ENV WINEDEBUG -all,err+all
ENV WINEDLLOVERRIDES winemenubuilder.exe=d

RUN (wineboot --init || true) && \
    rm -rf ~/.wine/drive_c/windows/Installer && \
    rm -rf ~/.wine/drive_c/windows/Microsoft.NET && \
    rm -rf ~/.wine/drive_c/windows/mono && \
    rm -rf ~/.wine/drive_c/windows/system32/gecko && \
    rm -rf ~/.wine/drive_c/windows/syswow64/gecko