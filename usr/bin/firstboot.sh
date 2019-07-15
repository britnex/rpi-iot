#!/bin/bash

set -e

# set hostname to mac address
netdev=$(ls -1 /sys/class/net/ | grep "^e")
if test -e /sys/class/net/${netdev}/address; then 
 name="rpi-"$(sed /sys/class/net/${netdev}/address -e 's/://g')
 echo "$name" > /etc/hostname
 hostnamectl set-hostname $name
 sed -i "s/raspberrypi/$name/g" /etc/hosts 
fi

# enable firewall
ufw default deny
ufw allow ssh
ufw enable


# disable this service
systemctl disable firstboot
systemctl mask firstboot

#enable readonly 
reboot-ro
exit 0
