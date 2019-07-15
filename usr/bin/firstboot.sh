#!/bin/bash

set -e

# set hostname to mac address
if test -e /sys/class/net/eth0/address; then 
 name="rpi-"$(sed /sys/class/net/eth0/address -e 's/://g')
 echo "$name" > /etc/hostname
 hostname $name
fi

# enable firewall
ufw default deny
ufw allow ssh
ufw enable

#enable readonly 
echo 7 > /boot/readonly

# disable this service
systemctl disable firstboot
systemctl mask firstboot

reboot
exit 0
