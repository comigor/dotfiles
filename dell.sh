#!/bin/bash

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
    
    # https://unix.stackexchange.com/questions/678609/how-to-disable-fingerprint-authentication-when-laptop-lid-is-closed
    sudo sh -c 'cat > /etc/acpi/laptop-lid.sh << EOF
#!/bin/bash

lock=$HOME/.fprint-disabled

if grep -Fq closed /proc/acpi/button/lid/LID0/state &&
    grep -Fxq connected /sys/class/drm/card0-*DP*/status; then
    touch "$lock"
    systemctl stop fprintd
    systemctl mask fprintd
elif [ -f "$lock" ]; then
    systemctl unmask fprintd
    systemctl start fprintd
    rm "$lock"
fi
EOF'
    sudo chmod +x /etc/acpi/laptop-lid.sh

    sudo sh -c 'cat > /etc/acpi/events/laptop-lid << EOF
event=button/lid.*
action=/etc/acpi/laptop-lid.sh
EOF'

    sudo sh -c 'cat > /etc/systemd/system/laptop-lid.service << EOF
[Unit]
Description=Laptop Lid
After=suspend.target

[Service]
ExecStart=/etc/acpi/laptop-lid.sh

[Install]
WantedBy=multi-user.target
WantedBy=suspend.target
EOF'

    sudo apt install autorandr -y
fi

# xrandr --output DP-1-2 --mode 2560x1440 --rate 59.95 --pos 0x0 --rotate left --output DP-1-3 --primary --mode 2560x1440 --rate 164.80 --pos 1440x496 --rotate normal
