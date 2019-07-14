#!/bin/bash
set -x
set -e

chmod 444 /etc/cron.daily/man-db || true
chmod 444 /etc/cron.weekly/man-db || true

chmod 744 /usr/bin/reboot-rw.sh
chmod 744 /usr/bin/reboot-ro.sh

chmod 644 /etc/ssh/sshd_config

# build uboot compatible initrd
chmod 744 /etc/initramfs-tools/hooks/overlay
chmod 744 /etc/initramfs-tools/scripts/init-bottom/overlay

kernelver=$(ls -1a /lib/modules | grep -)
mkinitramfs -o initramfs.gz ${kernelver}
gunzip initramfs.gz
mkimage -A arm -T ramdisk -C none -n uInitrd -d initramfs /boot/uInitrd

rm -f initramfs.gz
rm -rf initramfs

# cleanup
DEBIAN_FRONTEND=noninteractive apt-get purge -y u-boot-tools initramfs-tools
DEBIAN_FRONTEND=noninteractive apt-get -y autoremove
DEBIAN_FRONTEND=noninteractive apt-get clean
