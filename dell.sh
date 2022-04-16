#!/bin/bash

## IS_DELL
if [ sudo dmidecode | grep -i dell ]; then
    # https://github.com/jules-ch/Ubuntu20-Setup-XPS13/blob/master/setup.sh
    sudo add-apt-repository universe
    sudo add-apt-repository multiverse
    sudo add-apt-repository restricted

    sudo sh -c 'cat > /etc/apt/sources.list.d/focal-dell.list << EOF
    deb http://dell.archive.canonical.com/updates/ focal-dell public
    # deb-src http://dell.archive.canonical.com/updates/ focal-dell public
    deb http://dell.archive.canonical.com/updates/ focal-oem public
    # deb-src http://dell.archive.canonical.com/updates/ focal-oem public
    deb http://dell.archive.canonical.com/updates/ focal-somerville public
    # deb-src http://dell.archive.canonical.com/updates/ focal-somerville public
    deb http://dell.archive.canonical.com/updates/ focal-somerville-melisa public
    # deb-src http://dell.archive.canonical.com/updates focal-somerville-melisa public
    EOF'

    sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys F9FDA6BED73CDC22

    sudo apt update -qq

    # Install drivers
    sudo apt install oem-somerville-melisa-meta libfprint-2-tod1-goodix oem-somerville-meta tlp-config -y
    sudo gpasswd -a $USER input
    sudo apt install libpam-fprintd -y

    sudo pam-auth-update
fi
## END DELL
