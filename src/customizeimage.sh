#!/bin/bash
set -x
set -e

DEBIAN_FRONTEND=noninteractive apt-get install -y u-boot-tools cloud-guest-utils ufw

ufw default deny
ufw allow ssh
ufw enable

systemctl enable ssh

mkdir -p /data/docker
touch /data/docker/.keep
curl -fsSL get.docker.com -o get-docker.sh && sh get-docker.sh

# disable swap
dphys-swapfile swapoff
systemctl disable dphys-swapfile
DEBIAN_FRONTEND=noninteractive apt-get purge -y dphys-swapfile

DEBIAN_FRONTEND=noninteractive apt-get purge -y logrotate

rm -f $(which rpi-update)

# enable watchdog
sed -i 's/#RuntimeWatchdogSec=0/RuntimeWatchdogSec=14/g' /etc/systemd/system.conf

# first boot, enable readonly in firstboot.sh
chmod 744 /usr/bin/firstboot.sh
systemctl enable firstboot

DEBIAN_FRONTEND=noninteractive apt-get clean

chmod 444 /etc/cron.daily/man-db || true
chmod 444 /etc/cron.weekly/man-db || true

chmod 744 /usr/bin/reboot-rw.sh
chmod 744 /usr/bin/reboot-ro.sh

chmod 644 /etc/ssh/sshd_config

# build uboot compatible initrd
chmod 744 /etc/initramfs-tools/hooks/overlay
chmod 744 /etc/initramfs-tools/scripts/init-bottom/overlay

kernelver=\$(ls -1a /lib/modules | grep -)
mkinitramfs -o initramfs.gz \${kernelver}
gunzip initramfs.gz
mkimage -A arm -T ramdisk -C none -n uInitrd -d initramfs /boot/uInitrd
