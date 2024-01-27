# Archlinux rescue image with mkosi

In this post we'll build a small single-file Archlinux rescue image for EFI systems.

We'll end up with a single EFI executable of about 400MiB which embeds a fully-fledged Archlinux system.
We can then put this image on the EFI partition and sign it for secure boot, to always have a way to chroot into a borked Archlinux installation on the system.
The image will include metadata which enables `systemd-boot` to automatically discover the image and add it to its menu when we place in `/efi/EFI/Linux` (the bootloader specification calls these "type 2 entries", see [Type #2 EFI Unified Kernel Images](https://uapi-group.org/specifications/specs/boot_loader_specification/#type-2-efi-unified-kernel-images)).

You can find a polished version of the image built in this post at <https://github.com/swsnr/arch-rescue-image>.

<!--more-->

## Prerequisites

We'll need a few packages:

```console
# pacman -S mkosi
# pacman -S --asdeps systemd-ukify
```

`mkosi` is the tool we use to build the image.
It requires `systemd-ukify` to build a unified kernel image.

## Configure mkosi

We start with a basic mkosi configuration in `mkosi.conf`:

```diff
diff --git a/mkosi.conf b/mkosi.conf
new file mode 100644
index 0000000..ce9e95a
--- /dev/null
+++ b/mkosi.conf
@@ -0,0 +1,6 @@
+[Distribution]
+Distribution=arch
+
+[Output]
+ImageId=archlinux-rescue
+Format=uki
```

We use Archlinux as the base distribution, assign an identifier for the image (which `mkosi` will use as the base name of the image files), and select the UKI output format to get a single EFI file.

We also create two directories to store the package cache for `mkosi` (which speeds up subsequent builds) and the output of `mkosi`, and we ignore all contents in these directories:

```diff
diff --git a/mkosi.cache/.gitignore b/mkosi.cache/.gitignore
new file mode 100644
index 0000000..120f485
--- /dev/null
+++ b/mkosi.cache/.gitignore
@@ -0,0 +1,2 @@
+*
+!/.gitignore
diff --git a/mkosi.output/.gitignore b/mkosi.output/.gitignore
new file mode 100644
index 0000000..120f485
--- /dev/null
+++ b/mkosi.output/.gitignore
@@ -0,0 +1,2 @@
+*
+!/.gitignore
```

`mkosi` automatically uses these directories for their respective purposes, without further configuration.

We can now try to build them image (we always pass `-f` to ensure `mkosi` fully rebuilds the image) but we'll see the following error:

```console
$ mkosi -f
[…]
‣ A kernel must be installed in the image to build a UKI
```

## Install packages

We obviously need to install a kernel into the image.
We take the opportunity to install a few other important packages:

```diff
diff --git a/mkosi.conf b/mkosi.conf
index ce9e95a..a03065c 100644
--- a/mkosi.conf
+++ b/mkosi.conf
@@ -4,3 +4,14 @@ Distribution=arch
 [Output]
 ImageId=archlinux-rescue
 Format=uki
+
+[Content]
+Packages=
+       base
+       intel-ucode
+       linux
+       linux-firmware
+       wireless-regdb
+       iwd
+       arch-install-scripts
```

We install `base` which is required for every Arch installation, the Linux kernel and its firmware blobs, the wireless regdb and the iwd daemon to configure wireless network interfaces, and `arch-install-scripts` for the `arch-chroot` tool which is handy for recovery.

Now things look better:

```console
$ mkosi -f
[…]
‣  /[…]/mkosi.output/archlinux-rescue.efi size is 550.1M, consumes 550.1M.
```

## Configure the image

Next we configure a few basic things for the image, namely the kernel command line, the locale, the keyboard layout, the timezone, and hostname:

```diff
diff --git a/mkosi.conf b/mkosi.conf
index a37d45e..67db49d 100644
--- a/mkosi.conf
+++ b/mkosi.conf
@@ -14,3 +14,8 @@ Packages=
        wireless-regdb
        iwd
        arch-install-scripts
+KernelCommandLine=
+Locale=en_US.UTF-8
+Keymap=us
+Timezone=UTC
+Hostname=archlinux-rescue
```

We explicitly set an empty kernel command line to override the default of `mkosi` which redirects boot messages to the serial console.
This is a good default for systems with only bare-bones physical access, but we're building a rescue image for desktops, which normally have a monitor and input devices attached.

## Set a root password

To prevent unauthorized access to the rescue image we set a root password,
by writing the password hash to `mkosi.rootpw` where `mkosi` picks it up:

```console
$ touch mkosi.rootpw
$ chmod 600 mkosi.rootpw
$ echo -n hashed: >>mkosi.rootpw
$ openssl passwd -6 >>mkosi.rootpw
Password:
Verifying - Password:
```

## Configure networking

To enable internet access from the rescue system we need to set up a basic network configuration.

First, we tune the systemd preset to enable the iwd daemon to support wireless connections:

```diff
diff --git a/mkosi.extra/etc/systemd/system-preset/10-rescue-image.preset b/mkosi.extra/etc/systemd/system-preset/10-r>
new file mode 100644
index 0000000..0f2c9fe
--- /dev/null
+++ b/mkosi.extra/etc/systemd/system-preset/10-rescue-image.preset
@@ -0,0 +1,4 @@
+enable iwd.service
+
+disable systemd-homed.service
+disable systemd-boot-update.service
```

While we're at it we also explicitly disable a few services we definitely don't need in a rescue image: homed as we likely won't create new user accounts in the rescue image, and boot update because we'd not like the rescue image to touch the bootloader on boot.
We have to disable these explicitly, because the default systemd preset enables all systemd services.
For the same reason we do not have to enable networkd and resolved even though we'll use them: They're already enabled by the default systemd preset.

After installing packages (see above) `mkosi` copies all files within the `mkosi.extra/` directory to the image at the path relative to `mkosi.extra`.
We use this feature to add our preset to the image; `mkosi` will then later apply all presets within the image to set up an initial service configuration.

Next, we tell networkd to manage ethernet and wlan interfaces in the image, by copying appropriate network files to the image, again via `mkosi.extra/`:

```diff
diff --git a/mkosi.extra/etc/systemd/network/80-wifi-station.network b/mkosi.extra/etc/systemd/network/80-wifi-station>
new file mode 100644
index 0000000..09fdddf
--- /dev/null
+++ b/mkosi.extra/etc/systemd/network/80-wifi-station.network
@@ -0,0 +1,8 @@
+# SPDX-License-Identifier: MIT-0
+
+[Match]
+Type=wlan
+WLANInterfaceType=station
+
+[Network]
+DHCP=yes
diff --git a/mkosi.extra/etc/systemd/network/89-ethernet.network b/mkosi.extra/etc/systemd/network/89-ethernet.network
new file mode 100644
index 0000000..0896e7a
--- /dev/null
+++ b/mkosi.extra/etc/systemd/network/89-ethernet.network
@@ -0,0 +1,9 @@
+# SPDX-License-Identifier: MIT-0
+
+# Enable DHCPv4 and DHCPv6 on all physical ethernet links
+[Match]
+Kind=!*
+Type=ether
+
+[Network]
+DHCP=yes
```

These files tell `systemd-networkd` to automatically configure any connected ethernet or wlan interfaces with DHCP, so our rescue image will automatically get an IP address as soon as a wlan connection is set up via `iwctl` or a ethernet cable is plugged in.

Finally, we enable `systemd-resolved` for DNS resolution in the rescue image, by symlinking `/etc/resolv.conf` to resolved:

```diff
diff --git a/mkosi.extra/etc/resolv.conf b/mkosi.extra/etc/resolv.conf
new file mode 120000
index 0000000..3639662
--- /dev/null
+++ b/mkosi.extra/etc/resolv.conf
@@ -0,0 +1 @@
+/run/systemd/resolve/stub-resolv.conf
```

## Configure pacman

With networking set up we can now configure pacman to allow installing additional software while booted in the rescue image, to handle any kind of recovery task:

```diff
diff --git a/mkosi.extra/etc/pacman.d/mirrorlist b/mkosi.extra/etc/pacman.d/mirrorlist
new file mode 100644
index 0000000..4512ea2
--- /dev/null
+++ b/mkosi.extra/etc/pacman.d/mirrorlist
@@ -0,0 +1,4 @@
+# World-wide geo-locating mirrors
+
+Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch
+Server = https://mirror.rackspace.com/archlinux/$repo/os/$arch
diff --git a/mkosi.postinst.chroot b/mkosi.postinst.chroot
new file mode 100755
index 0000000..51d9e7f
--- /dev/null
+++ b/mkosi.postinst.chroot
@@ -0,0 +1,10 @@
+#!/usr/bin/env bash
+# This Source Code Form is subject to the terms of the Mozilla Public
+# License, v. 2.0. If a copy of the MPL was not distributed with this
+# file, You can obtain one at http://mozilla.org/MPL/2.0/.
+
+set -euo pipefail
+
+echo "Populating pacman keyring"
+pacman-key --init
+pacman-key --populate
```

We add a default `mirrorlist` to the image using Arch's worldwide geolocating mirrors,  to avoid the hassle of setting up a mirrorlist for the occasional package installation during recovery.

We also initialize the `pacman` keyring within the image in a post-installation script.
`mkosi` runs the `postinst` script after package installation, but before configuration and image cleanup.
The `.chroot` extension tells `mkosi` to run the script while `chroot`ed into the image.

## Add manpages

To access man pages in the image we need to install a man page viewer and pager.
For the latter, `less` is the obvious choice, but for the former we choose `mandoc` over `man-db` because it's a lot smaller.

```diff
diff --git a/mkosi.conf b/mkosi.conf
index 67db49d..56b87b0 100644
--- a/mkosi.conf
+++ b/mkosi.conf
@@ -14,6 +14,9 @@ Packages=
        wireless-regdb
        iwd
        arch-install-scripts
+       less
+       man-pages
+       mandoc
 KernelCommandLine=
 Locale=en_US.UTF-8
 Keymap=us
diff --git a/mkosi.postinst.chroot b/mkosi.postinst.chroot
index 51d9e7f..3a65e42 100755
--- a/mkosi.postinst.chroot
+++ b/mkosi.postinst.chroot
@@ -8,3 +8,6 @@ set -euo pipefail
 echo "Populating pacman keyring"
 pacman-key --init
 pacman-key --populate
+
+echo "Updating manpage database"
+makewhatis /usr/share/man
```

However, unlike `man-db` there's no trigger for `mandoc` to update the manpage database, so we add this as a new step to our post-installation script.

## Set os-release metadata

## Shrink the image
