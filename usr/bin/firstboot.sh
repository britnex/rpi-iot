#!/bin/bash

set -e

#enable readonly 
echo 7 > /boot/readonly

# disable this service
systemctl disable firstboot
systemctl mask firstboot

reboot
exit 0
