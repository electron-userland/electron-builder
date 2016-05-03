wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -

sudo dpkg --add-architecture i386

sudo add-apt-repository ppa:wine/wine-builds -y
sudo apt-get update

sudo apt-get install -y winehq-devel