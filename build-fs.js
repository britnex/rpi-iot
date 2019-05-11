#!/bin/bash

set -x
set -e

cur=$(pwd)

mkdir -p /tmp/rpi
rm -rf /tmp/rpi/*

cd /tmp/rpi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y bison bc flex build-essential git gcc-arm-linux-gnueabi unzip tar mount dosfstools e2fsprogs qemu-user-static qemu-system-arm zip rsync coreutils 
export ARCH=arm
export CROSS_COMPILE=arm-linux-gnueabi-

git clone git://git.denx.de/u-boot.git
pushd u-boot
make rpi_2_defconfig
make u-boot.bin
UBOOTBIN=$(pwd)/u-boot.bin
popd

wget https://downloads.raspberrypi.org/raspbian_lite_latest -O raspbian_lite_latest.zip
unzip raspbian_lite_latest.zip


imgfname=$(ls -1 *.img)
losetup -fP ${imgfname}
LSRC=$(losetup -a | grep raspbian-stretch-lite | sed 's/://g' | cut -d' ' -f1)


dd if=/dev/zero of=dd.img bs=1M count=7000
losetup -fP dd.img
LDST=$(losetup -a | grep dd.img | sed 's/://g' | cut -d' ' -f1)

sfdisk $LDST  << EOF
,128M,c
,2048M
,2048M
,2048M
EOF

mkfs.vfat -n BOOT -F 32 ${LDST}p1
mkfs.ext4 -F -O ^64bit -L ROOTFSA ${LDST}p2
mkfs.ext4 -F -O ^64bit -L ROOTFSB ${LDST}p3
mkfs.ext4 -F -O ^64bit -L DATA ${LDST}p4

tune2fs -c 1 ${LDST}p2
tune2fs -c 1 ${LDST}p3
tune2fs -c 1 ${LDST}p4

mkdir -p /tmp/rpi/src/boot
mount ${LSRC}p1 /tmp/rpi/src/boot

mkdir -p /tmp/rpi/src/rootfs
mount ${LSRC}p2 /tmp/rpi/src/rootfs



mkdir -p /tmp/rpi/dst/rootfs
mount ${LDST}p2 /tmp/rpi/dst/rootfs
 
rsync -az -H --delete --numeric-ids /tmp/rpi/src/rootfs/ /tmp/rpi/dst/rootfs/

# copy 
cp -a ${cur}/etc/* /tmp/rpi/dst/rootfs/etc/
cp -a ${cur}/lib/* /tmp/rpi/dst/rootfs/lib/
cp -a ${cur}/usr/* /tmp/rpi/dst/rootfs/usr/

mkdir -p /tmp/rpi/dst/rootfs/boot/uboot
mount ${LDST}p1 /tmp/rpi/dst/rootfs/boot

# copy required rpi boot files to /boot/uboot (boot partition)
cp /tmp/rpi/src/boot/bootcode.bin /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/start.elf /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/config.txt /tmp/rpi/dst/rootfs/boot/uboot/
cp ${UBOOTBIN} /tmp/rpi/dst/rootfs/uboot/boot/
echo "kernel=u-boot.bin" >> /tmp/rpi/dst/rootfs/boot/uboot/config.txt

# copy required linux boot files to /boot (on rootfs partition)
rsync -az -H --delete --numeric-ids /tmp/rpi/src/boot/ /tmp/rpi/dst/rootfs/boot
# remove unused files
rm -f /tmp/rpi/dst/rootfs/boot/config.txt
rm -f /tmp/rpi/dst/rootfs/boot/cmdline.txt
rm -f /tmp/rpi/dst/rootfs/boot/bootcode.bin
rm -f /tmp/rpi/dst/rootfs/boot/start.elf


mkdir -p /tmp/rpi/dst/rootfs/data
mount ${LDST}p4 /tmp/rpi/dst/rootfs/data

echo "dwc_otg.lpm_enable=0 console=tty1 root=/dev/mmcblk0p2 rootfstype=ext4 elevator=deadline fsck.repair=yes rootwait qu3iet init=/sbin/init" > /tmp/rpi/src/boot/cmdline.txt

cat <<EOF >/tmp/rpi/dst/rootfs/etc/fstab
proc            /proc           proc    defaults          0       0
/dev/mmcblk0p1  /boot/uboot     vfat    defaults          0       2
/dev/mmcblk0p2  /               ext4    defaults,noatime,data=journal  0       1
/dev/mmcblk0p4  /data           ext4    defaults,noatime,data=journal  0       1
tmpfs           /tmp            tmpfs   size=20M          0       0
tmpfs           /var/tmp        tmpfs   size=20M          0       0
tmpfs           /var/log        tmpfs   size=40M          0       0
EOF


cp $(which qemu-arm-static) /tmp/rpi/src/rootfs/usr/bin

mount -t proc proc /tmp/rpi/src/rootfs/proc/
mount -t sysfs sys /tmp/rpi/src/rootfs/sys/
mount -o bind /dev /tmp/rpi/src/rootfs/dev/



cat <<EOF >/tmp/rpi/dst/rootfs/script.sh
#!/bin/bash
mkdir -p /data/docker
touch /data/docker/.keep
curl -fsSL get.docker.com -o get-docker.sh && sh get-docker.sh

# disable swap
dphys-swapfile swapoff
systemctl disable dphys-swapfile
DEBIAN_FRONTEND=noninteractive apt-get purge -y dphys-swapfile

DEBIAN_FRONTEND=noninteractive apt-get purge -y logrotate

rm -f $(which rpi-update)

chmod -x /etc/cron.daily/man-db || true
chmod -x /etc/cron.weekly/man-db || true

# enable readonly filesystem
chmod +x /etc/initramfs-tools/hooks/overlay
chmod +x /etc/initramfs-tools/scripts/init-bottom/overlay

# readonly enabled in firstboot.sh

# enable watchdog
echo "dtparam=watchdog=on" >>/boot/config.txt
sed -i 's/#RuntimeWatchdogSec=0/RuntimeWatchdogSec=14/g' /etc/systemd/system.conf

# first boot
chmod +x /usr/bin/firstboot.sh
systemctl enable firstboot

# enable fs check on every boot
touch /forcefsck

DEBIAN_FRONTEND=noninteractive apt-get clean

EOF
chmod +x /tmp/rpi/dst/rootfs/script.sh

chroot /tmp/rpi/dst/rootfs /script.sh
rm -f /tmp/rpi/dst/rootfs/script.sh
rm -f /tmp/rpi/src/rootfs/usr/bin/qemu-arm-static

mkdir -p /tmp/rpi/dst/rootfs/etc/docker
cat <<EOF >/tmp/rpi/dst/rootfs/etc/docker/daemon.json
{
"graph": "/data/docker"
}
EOF


cat <<EOF >/tmp/rpi/dst/rootfs/etc/default/keyboard
# KEYBOARD CONFIGURATION FILE

# Consult the keyboard(5) manual page.

XKBMODEL="pc105"
XKBLAYOUT="de"
XKBVARIANT=""
XKBOPTIONS=""

BACKSPACE="guess"
EOF



pushd /tmp/rpi/dst/rootfs
tar czf /tmp/rpi/image.tgz *
popd

umount /tmp/rpi/src/rootfs/dev/
umount /tmp/rpi/src/rootfs/sys/
umount /tmp/rpi/src/rootfs/proc/

umount /tmp/rpi/dst/rootfs/boot
umount /tmp/rpi/dst/rootfs/data

umount /tmp/rpi/dst/rootfs || umount -f /tmp/rpi/dst/rootfs

umount /tmp/rpi/src/boot
umount /tmp/rpi/src/rootfs


losetup -D ${LDST}
losetup -D ${LSRC}

hash=$(sha256sum /tmp/rpi/image.tgz | cut -d' ' -f1)
tar czf /tmp/rpi/image-${hash}-dd.tgz dd.img
rm -f *.img
rm -f *.zip

mv /tmp/rpi/image.tgz /tmp/rpi/image-${hash}-fs.tgz

ls -la /tmp/rpi/

