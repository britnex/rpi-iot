#!/bin/bash

mount -o remount,rw /ro
rm -f /ro/boot/readonly
rm -f /boot/readonly
mount -o remount,ro /ro

reboot
