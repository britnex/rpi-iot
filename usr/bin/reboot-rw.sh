#!/bin/bash

mount -o remount,rw /ro
rm -f /boot/readonly
mount -o remount,ro /ro

reboot
