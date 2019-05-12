#!/bin/bash

mkinitramfs -o /boot/initramfs.gz
#enable readonly 
echo readonly > /boot/readonly

# disable this service
systemctl disable firstboot
systemctl mask firstboot

#reboot
exit 0
