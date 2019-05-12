#!/bin/bash

set -e

pushd /tmp
mkinitramfs -o initramfs.gz
gunzip initramfs.gz
mkimage -A arm -T ramdisk -C none -n uInitrd -d initramfs /boot/uInitrd
popd

#enable readonly 
echo readonly > /boot/readonly

# disable this service
systemctl disable firstboot
systemctl mask firstboot

reboot
exit 0
