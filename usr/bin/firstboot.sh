#!/bin/bash

set -e

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
