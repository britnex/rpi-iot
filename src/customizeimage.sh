#!/bin/bash
set -x
set -e

DEBIAN_FRONTEND=noninteractive apt-get install -y u-boot-tools cloud-guest-utils ufw
DEBIAN_FRONTEND=noninteractive apt-get clean

chmod 444 /etc/cron.daily/man-db || true
chmod 444 /etc/cron.weekly/man-db || true

chmod 744 /usr/bin/reboot-rw.sh
chmod 744 /usr/bin/reboot-ro.sh

chmod 744 /etc/init.d/resize2fs_once

chmod 644 /etc/ssh/sshd_config

# build uboot compatible initrd
chmod 744 /etc/initramfs-tools/hooks/overlay
chmod 744 /etc/initramfs-tools/scripts/init-bottom/overlay

kernelver=$(ls -1a /lib/modules | grep -)
mkinitramfs -o initramfs.gz ${kernelver}
gunzip initramfs.gz
mkimage -A arm -T ramdisk -C none -n uInitrd -d initramfs /boot/uInitrd
