wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -

sudo dpkg --add-architecture i386
sudo add-apt-repository ppa:ubuntu-wine/ppa -y
sudo apt-get update
sudo apt-get install wine1.8 ca-certificates-mono -y