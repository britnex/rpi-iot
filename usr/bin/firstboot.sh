#!/bin/bash

set -e

#enable readonly 
echo readonly > /boot/readonly

# disable this service
systemctl disable firstboot
systemctl mask firstboot

reboot
exit 0
