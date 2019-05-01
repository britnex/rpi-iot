#!/bin/bash

# enable readonly
if ! cat /boot/cmdline.txt | grep "overlay=yes"; then
  sed -i '1 s/^/overlay=yes /' /boot/cmdline.txt 
fi

# disable this service
systemctl disable firstboot
systemctl mask firstboot

reboot
exit 0
