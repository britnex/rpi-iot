#!/bin/bash

# enable readonly
#if ! cat /boot/cmdline.txt | grep "overlay=yes"; then
#  sed -i '1 s/^/overlay=yes /' /boot/cmdline.txt 
#fi

mkinitramfs -o /boot/initramfs.gz
#echo "initramfs initramfs.gz followkernel" >>/boot/config.txt

# disable this service
systemctl disable firstboot
systemctl mask firstboot

#reboot
exit 0
