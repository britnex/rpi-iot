#!/bin/bash

set -x
set -e

cur=$(pwd)

mkdir -p /tmp/rpi
rm -rf /tmp/rpi/*

cd /tmp/rpi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y u-boot-tools bison bc flex build-essential git gcc-arm-linux-gnueabi unzip tar mount dosfstools e2fsprogs qemu-user-static qemu-system-arm zip rsync coreutils
DEBIAN_FRONTEND=noninteractive apt-get install -y console-data console-common tzdata locales keyboard-configuration debootstrap qemu-user-static u-boot-tools dosfstools zip tar e2fsprogs
export ARCH=arm
export CROSS_COMPILE=arm-linux-gnueabi-

git clone git://git.denx.de/u-boot.git
pushd u-boot
make rpi_2_defconfig
sed -i 's/CONFIG_BOOTCOMMAND/#CONFIG_BOOTCOMMAND/g' .config 
echo "CONFIG_BOOTCOMMAND=\"mmc dev 0; fatload mmc 0:1 \${scriptaddr} uboot.shi; source \${scriptaddr}\"" >> .config
make u-boot.bin
UBOOTBIN=$(pwd)/u-boot.bin
popd

wget https://downloads.raspberrypi.org/raspbian_lite_latest -O raspbian_lite_latest.zip
unzip raspbian_lite_latest.zip


imgfname=$(ls -1 *.img)
losetup -fP ${imgfname}
LSRC=$(losetup -a | grep $imgfname | sed 's/://g' | cut -d' ' -f1)


dd if=/dev/zero of=dd.img bs=1M count=7000
# set active rootfs 'A'=0x41
printf '\x41' | dd of=dd.img bs=1 seek=0 conv=notrunc
losetup -fP dd.img
LDST=$(losetup -a | grep dd.img | sed 's/://g' | cut -d' ' -f1)

sfdisk $LDST  << EOF
,32M,c
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
 

# build rootfs
DIST=buster

pushd /tmp/rpi/dst
debootstrap --arch=armhf --variant=minbase --include sysvinit-core,openssh-server,auditd,u-boot-tools,initramfs-tools,gzip,cloud-guest-utils,ufw --foreign $DIST rootfs http://ftp.debian.org/debian

# included qemu arm emulator into image (required to chroot into rootfs)
cp $(which qemu-arm-static) rootfs/usr/bin

sed -i -e 's/systemd systemd-sysv //g' rootfs/debootstrap/required

cat <<EOF >>rootfs/etc/apt/apt.conf
APT::Get::Install-Recommends "false";
APT::Get::Install-Suggests "false";
APT::Install-Recommends "false";
APT::AutoRemove::RecommendsImportant "false";
APT::AutoRemove::SuggestsImportant "false";
EOF

cat <<EOF >>rootfs/etc/pam.d/password-auth
session     required      pam_tty_audit.so enable=*
EOF
cat <<EOF >>rootfs/etc/pam.d/system-auth
session     required      pam_tty_audit.so enable=*
EOF
cat <<EOF >>rootfs/etc/pam.d/sshd
session     required      pam_tty_audit.so enable=*
EOF

# boot scripts started from /etc/rc.local (if files are executable)
mkdir -p rootfs/etc/boot.d

cat <<EOF > rootfs/etc/boot.d/99_firstboot
#!/bin/bash

# set hostname to mac address
if test -e /sys/class/net/eth0/address; then 
 name="rpi-"\$(sed /sys/class/net/eth0/address -e 's/://g')
 echo "\$name" > /etc/hostname
 hostname \$name
 chmod -x \$0
fi

# enable firewall
ufw default deny
ufw allow ssh
ufw enable

#disable this script
chmod -x \$0
#enable readonly
reboot-ro
EOF
chmod +x rootfs/etc/boot.d/99_firstboot

# finish debootstrap
chroot rootfs debootstrap/debootstrap --second-stage

popd
#end build rootfs


# copy raspberry pi kernel modules
mkdir -p /tmp/rpi/dst/rootfs/lib/modules
rsync -az -H --delete --numeric-ids /tmp/rpi/src/rootfs/lib/modules /tmp/rpi/dst/rootfs/lib


# copy files from this repository to image
cp -a ${cur}/etc/* /tmp/rpi/dst/rootfs/etc/
cp -a ${cur}/lib/* /tmp/rpi/dst/rootfs/lib/
cp -a ${cur}/usr/* /tmp/rpi/dst/rootfs/usr/

# show readonly in command prompt
cat <<EOF >>/tmp/rpi/dst/rootfs/etc/bash.bashrc
if df | grep "/rw\$" > /dev/null; then
PS1=\$(echo \$PS1 "\[\033[0;31m\](readonly)\[\033[0m\] ")
fi
EOF

mkdir -p /tmp/rpi/dst/rootfs/boot/uboot
mount ${LDST}p1 /tmp/rpi/dst/rootfs/boot/uboot

# copy required rpi boot files to /boot/uboot (boot partition)
cp /tmp/rpi/src/boot/*.bin /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/*.elf /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/*.dat /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/*.dtb /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/COPYING.linux /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/LICENCE.broadcom /tmp/rpi/dst/rootfs/boot/uboot/
cp /tmp/rpi/src/boot/config.txt /tmp/rpi/dst/rootfs/boot/uboot/
cp ${UBOOTBIN} /tmp/rpi/dst/rootfs/boot/uboot/
echo "kernel=u-boot.bin" >> /tmp/rpi/dst/rootfs/boot/uboot/config.txt

# convert to uboot script format
mkimage -T script -C none -n 'Boot Script' -d ${cur}/src/uboot.shi.txt /tmp/rpi/dst/rootfs/boot/uboot/uboot.shi

# copy required linux boot files to /boot (on rootfs partition)
rsync -az -H --numeric-ids /tmp/rpi/src/boot/ /tmp/rpi/dst/rootfs/boot
# remove unused files
rm -f /tmp/rpi/dst/rootfs/boot/config.txt
rm -f /tmp/rpi/dst/rootfs/boot/cmdline.txt
rm -f /tmp/rpi/dst/rootfs/boot/bootcode.bin
rm -f /tmp/rpi/dst/rootfs/boot/*.elf
rm -f /tmp/rpi/dst/rootfs/boot/*.dat

mkdir -p /tmp/rpi/dst/rootfs/data
mount ${LDST}p4 /tmp/rpi/dst/rootfs/data

#echo "dwc_otg.lpm_enable=0 console=tty1 root=/dev/mmcblk0p2 rootfstype=ext4 elevator=deadline fsck.repair=yes rootwait qu3iet init=/sbin/init" > /tmp/rpi/src/boot/cmdline.txt

cat <<EOF >/tmp/rpi/dst/rootfs/etc/fstab
proc            /proc           proc    defaults                       0       0
/dev/mmcblk0p2  /               ext4    defaults,noatime               0       1
/dev/mmcblk0p4  /data           ext4    defaults,noatime,data=journal  0       1
tmpfs           /tmp            tmpfs   size=100M                      0       0
tmpfs           /var/tmp        tmpfs   size=100M                      0       0
tmpfs           /var/log        tmpfs   size=40M                       0       0
EOF



mount -o bind /proc /tmp/rpi/dst/rootfs/proc/
mount -o bind /sys /tmp/rpi/dst/rootfs/sys/
mount -o bind /dev /tmp/rpi/dst/rootfs/dev/

# customize image in chroot
cp ${cur}/src/customizeimage.sh /tmp/rpi/dst/rootfs/customizeimage.sh
chmod +x /tmp/rpi/dst/rootfs/customizeimage.sh

chroot /tmp/rpi/dst/rootfs /customizeimage.sh
rm -f /tmp/rpi/dst/rootfs/customizeimage.sh


cat <<EOF >/tmp/rpi/dst/rootfs/etc/default/keyboard
# KEYBOARD CONFIGURATION FILE

# Consult the keyboard(5) manual page.

XKBMODEL="pc105"
XKBLAYOUT="de"
XKBVARIANT=""
XKBOPTIONS=""

BACKSPACE="guess"
EOF


# emulator no longer required
rm -f /tmp/rpi/dst/rootfs/usr/bin/qemu-arm-static

pushd /tmp/rpi/dst/rootfs
tar czf /tmp/rpi/image.tgz --exclude=dev/* --exclude=proc/* --exclude=sys/* --exclude=/lost+found *
popd

pushd /
umount /tmp/rpi/dst/rootfs/dev
umount /tmp/rpi/dst/rootfs/sys
umount /tmp/rpi/dst/rootfs/proc

umount /tmp/rpi/dst/rootfs/boot/uboot
umount /tmp/rpi/dst/rootfs/data

umount /tmp/rpi/dst/rootfs || umount -f /tmp/rpi/dst/rootfs

umount /tmp/rpi/src/boot
umount /tmp/rpi/src/rootfs
popd

sleep 1

losetup -D ${LDST}
losetup -D ${LSRC}

sync
losetup -a

hash=$(sha1sum /tmp/rpi/image.tgz | cut -d' ' -f1)
tar czf /tmp/rpi/image-${hash}-dd.tgz dd.img
rm -f *.img
rm -f *.zip

mv /tmp/rpi/image.tgz /tmp/rpi/image-${hash}-fs.tgz

ls -la /tmp/rpi/

