  # Arch Linux rescue image with mkosi

 In this post we'll build a small single-file Arch Linux rescue image for EFI systems.

  We will end up with a single EFI executable of about 400 MiB which embeds a fully-fledged Arch Linux system.
  We can then put this image on the EFI partition and sign it for secure boot, which gives us a rescue single-file rescue system to boot into in case the main Arch installation does not boot anymore.
  From that rescue system we can then `chroot` into the main installation to repair it.

  The image will include metadata which enables `systemd-boot` to automatically discover the image and add it to its menu when we place in `/efi/EFI/Linux` (the bootloader specification calls these "type 2 entries", see [Type #2 EFI Unified Kernel Images](https://uapi-group.org/specifications/specs/boot_loader_specification/#type-2-efi-unified-kernel-images)).

  You can find my personal version of the image built in this post at <https://github.com/swsnr/arch-rescue-image>.

  <!--more-->

I got the idea from a recent post by the mkosi maintainer at <https://0pointer.net/blog/a-re-introduction-to-mkosi-a-tool-for-generating-os-images.html> which I recommend reading for more information about `mkosi`. 
The post calls what we're building here a Unified System Image (USI).

  ## Prerequisites

  We'll need a few packages:

  ```console
  # pacman -S mkosi
  # pacman -S --asdeps systemd-ukify
  ```

  `mkosi` builds the image, and uses `systemd-ukify` to build a UKI.

  ## Configure mkosi

  We configure the image in `mkosi.conf`:

  ```ini
  [Distribution]
  Distribution=arch

  [Output]
  ImageId=archlinux-rescue
  Format=uki

  [Content]
  Hostname=archlinux-rescue
  Bootloader=none
  Bootable=false
  Packages=
      base
      intel-ucode
      linux
      linux-firmware
      wireless-regdb
      iwd
      nano
      less
      mandoc
      man-pages
      arch-install-scripts
  ```

  We

  - select Arch as base distribution for the image,
  - configure the identifier of the image which also configure the output filenames,
  - enable the UKI output format,
  - set a hostname for the image,
  - and disable bootloader installation (otherwise `mkosi` would install a somewhat superfluous EFI partition inside the UKI).

  We also tell `mkosi` to install some essential packages into the image.
  We add

  - base and a kernel,
  - firmware binaries, which are essential to boot on any modern hardware,
  - the regulatory database, which is required for wireless connections,
  - the `iwd` daemon to configure wireless interfaces and connect to wireless stations,
  - the simple `nano` text editor,
  - `less` as pager, and `mandoc` for the `man` command (`mandoc` is somewhat smaller than `man-db`), and
  - `arch-install-scripts` for the `arch-chroot` command.

  ## Define the systemd preset

  We customize the systemd preset to enable the `iwd` daemon automatically, and disable a few standard systemd services which have no use in a single-user rescue image:

  ```diff
  new file mode 100644
  index 0000000..4f00b6f
  --- /dev/null
  +++ b/mkosi.extra/etc/systemd/system-preset/10-rescue-image.preset
  @@ -0,0 +1,4 @@
  +disable systemd-homed.service
  +disable systemd-userdbd.socket
  +disable systemd-boot-update.service
  +enable iwd.service
  ```

  `mkosi` automatically copies the file system tree in the `mkosi.extra` directory to the image.
  Hence, our preset file will end up in `/etc/systemd/system-preset/10-rescue-image.preset` inside the image, where `mkosi` will pick it up from when it applies the preset as one of its last steps in the build process.

  ## Configure networking

  In addition to our custom preset file the default systemd preset applies, which enables `systemd-resolved` and `systemd-networkd` and thus provides us with a small yet capable network management stack in the
  However, we still need to configure this stack a bit for proper networking when booting the image on real hardware.

  We first put `systemd-resolved` into the recommended `stub` mode for the `resolv.conf` file, to make sure all DNS resolution goes through resolved, by placing the `resolv.conf` symlink to `/run/systemd/resolve/stub-resolv.conf` into the `mkosi.extra` directory (the diff actually describes a symlink in Git):

  ```diff
  new file mode 120000
  index 0000000..3639662
  --- /dev/null
  +++ b/mkosi.extra/etc/resolv.conf
  @@ -0,0 +1 @@
  +/run/systemd/resolve/stub-resolv.conf
  ```

  From there `mkosi` copies the symlink itself to the image literally.

  By default, `systemd-networkd` only manages virtual network interfaces of containers and virtual machines, which implies that we automatically have a network connection when testing the image with `mkosi qemu`.
  On real hardware however we have real Ethernet and wireless interfaces which we also want `systemd-networkd` to handle in our rescue image:


  ```diff
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

  ## Configure pacman

  With networking set up we can now configure pacman.
  This enables us to install additional software while booted in the rescue image, to handle any kind of recovery task:

  ```diff
  new file mode 100644
  index 0000000..3bd39de
  --- /dev/null
  +++ b/mkosi.extra/etc/pacman.d/mirrorlist
  @@ -0,0 +1,2 @@
  +Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch
  +Server = https://mirror.rackspace.com/archlinux/$repo/os/$arch
  new file mode 100755
  index 0000000..b4db6db
  --- /dev/null
  +++ b/mkosi.postinst.chroot
  @@ -0,0 +1,6 @@
  +#!/usr/bin/env bash
  +set -euo pipefail
  +
  +echo "Populating pacman keyring"
  +pacman-key --init
  +pacman-key --populate
  ```

  We add a `mirrorlist` using Arch's worldwide geolocating mirrors, to avoid the hassle of setting up a mirror list for the occasional package installation during recovery.

  We also initialize the `pacman` key ring within the image in a post-installation script.
  `mkosi` runs this `postinst` script after package installation, but before configuration and image cleanup.
  The `.chroot` extension tells `mkosi` to run the script while `chroot`ed into the image.

  ## Initialize manpage database

  In this post-installation script we also initialize the manpage database now, as `mandoc` does not do this automatically after package installation:

  ```diff
  diff --git a/mkosi.postinst.chroot b/mkosi.postinst.chroot
  index b4db6db..03ece97 100755
  --- a/mkosi.postinst.chroot
  +++ b/mkosi.postinst.chroot
  @@ -4,3 +4,6 @@ set -euo pipefail
  echo "Populating pacman keyring"
  pacman-key --init
  pacman-key --populate
  +
  +echo "Updating manpage database"
  +makewhatis /usr/share/man
  ```

  Now we can use `man` in the image to read documentation.

  ## Set OS metadata

  A UKI image contains release metadata which systemd-boot uses to create a menu entry for the UKI.
  So far, our image contains the default release metadata of Arch Linux, and thus appears as a regular Arch system in the systemd-boot menu.
  We add a custom `/etc/os-release` file to change the identification of the rescue image:

  ```diff
  new file mode 100644
  index 0000000..4c47e89
  --- /dev/null
  +++ b/mkosi.extra/etc/os-release
  @@ -0,0 +1,6 @@
  +NAME="Arch Linux"
  +ID=arch
  +VARIANT="Rescue Image"
  +VARIANT_ID=rescue
  +BUILD_ID=rolling
  +ANSI_COLOR="38;2;23;147;209"
  new file mode 100755
  index 0000000..abe3a3e
  --- /dev/null
  +++ b/mkosi.finalize
  @@ -0,0 +1,6 @@
  +#!/usr/bin/env bash
  +set -euo pipefail
  +
  +echo "Finalizing /etc/os-release"
  +source "${BUILDROOT}/etc/os-release"
  +echo "PRETTY_NAME=\"${NAME} (${VARIANT} ${IMAGE_VERSION:-n/a})\"" >> "${BUILDROOT}/etc/os-release"
  ```

  We add a custom `/etc/os-release` to the image with the `mkosi.extra` tree, and then use a `finalize` script, which `mkosi` runs at the very end of the build process, to generate the `$PRETTY_NAME`, which systemd-boot uses as the menu label.
  By generating `$PRETTY_NAME` dynamically we can include the `$IMAGE_VERSION` in the name, which `mkosi` sets from the `--image-version` argument.

  This allows us to build the image with e.g. `--image-version=$(git rev-parse --short=10 HEAD)-$(date --utc +%Y%m%d%H%M)` to have the git hash and timestamp appear in the menu name, to quickly see how old the rescue image is.

  ## Set a root password

  To prevent unauthorized access to the rescue image we set a root password.
  `mkosi` reads a plain text or hashed password from the `mkosi.rootpw` file.
  We can use `openssl passwd` to generate a hashed password.

  ```console
  $ touch mkosi.rootpw
  $ chmod 600 mkosi.rootpw
  $ echo -n hashed: >>mkosi.rootpw
  $ openssl passwd -6 >>mkosi.rootpw
  Password:
  Verifying - Password:
  ```

  For testing, we can use `mkosi -f --autologin qemu` to start a VM without having to type the root password.

  ## Build the image

  We're now ready to build the image, but before we do so we create two additional directories for `mkosi`:

  ```console
  $ mkdir mkosi.cache mkosi.output
  ```

  `mkosi` writes the generated image to the `mkosi.output` directory if it exists.
  We create this directory to move the generated images out of the way, and make it easier to `gitignore` the build artifacts.

  If `mkosi.cache` exists `mkosi` will use it for the package manager cache, and re-use the cached package artifacts for subsequent rebuilds which reduces strain on the Arch mirrors a bit and speeds up subsequent builds of the image.

  Now, let's build the image:

  ```console
  $ mkosi -f --image-version=$(date --utc +%Y%m%d%H%M%S)
  […]
  ‣  […]/mkosi.output/archlinux-rescue_20240128082906.efi size is 560.4M, consumes 560.4M.
  ```

  The image builds successfully.  It's fairly large though.
  To test it with `qemu` we need to give the VM more memory than the default 2GB `mkosi` gives to it:

  ```console
  $ mkosi -f --autologin --qemu-mem=6G qemu
  […]
  Arch Linux 6.7.1-arch1-1 (ttyS0)

  archlinux-rescue login: root (automatic login)

  Last login: […] on tty1
  [root@archlinux-rescue ~]#
  ```

  Before we install our image, let's check the metadata:

  ```console
  $ ukify inspect mkosi.output/archlinux-rescue_20240128082906.efi
  […]
  .osrel:
    size: 227 bytes
    sha256: 94d2621c5426c1041d463f64c97a41d5d927599d648d4c09438f93f5243b4eb6
    text:
      NAME="Arch Linux"
      ID=arch
      VARIANT="Rescue Image"
      VARIANT_ID=rescue
      BUILD_ID=rolling
      ANSI_COLOR="38;2;23;147;209"
      IMAGE_ID="archlinux-rescue"
      IMAGE_VERSION="20240128082906"
      PRETTY_NAME="Arch Linux (Rescue Image 20240128082906)"
  […]
  ```

  Our metadata is there; `systemd-boot` will show this image under the above `PRETTY_NAME`.

  If size is no concern, i.e. if the EFI system partition or the XBOOTLDR partition are sufficiently large to hold this image, we can now install it to the EFI partition and (optionally) sign it for secure boot:

  ```console
  # install -m644 mkosi.output/archlinux-rescue_20240128082906.efi \
  > /efi/EFI/Linux/archlinux-rescue.efi
  # sbctl sign /efi/EFI/Linux/archlinux-rescue.efi
  ```

  We can however also shrink the image by removing files we do not need.

  ## Shrink the image

  Let's first try a few simple cleanups:

  ```diff
  index 08d7d01..40ee5a1 100644
  --- a/mkosi.conf
  +++ b/mkosi.conf
  @@ -21,3 +21,9 @@ Packages=
      less
      man-pages
      mandoc
  +RemoveFiles=
  +    /usr/include/
  +    /usr/share/include
  +    /usr/share/pkgconfig
  +    /usr/lib/**/*.a
  +    /usr/share/locale
  ```

  We remove all headers and `pkg-config` files, and all static libraries.
  These files are for compiling programs, and we're quite unlikely to do that in a rescue image.
  We also remove all locales, because we use `C.UTF-8` in the image instead of localized messages.

  This gets the image down by a bit:

  ```console
  $ mkosi -f
  […]
  ‣  […]/mkosi.output/archlinux-rescue.efi size is 528.7M, consumes 528.7M.
  ```

  To make a real difference, however, we need to shrink the biggest contributors to the size of the image: Kernel modules and firmware.
  `mkosi` has builtin support for shrinking the kernel module tree along with firmware:

  ```diff
  +KernelModulesExclude=.*
  +KernelModulesIncludeHost=true
  +KernelModulesInclude=
  +    fs/
  +    hid/
  +    input/
  +    usb/
  +    dm-.*
  +    crypto/
  +    tpm/
  +    virtio
  ```

  We first default to excluding all kernel modules: `mkosi` does not touch kernel modules by default, so excluding all modules is necessary to make the subsequent include rules take effect.

  With these include rules we first include all kernel modules currently used on the host system: We'd like to use the image to boot into our hardware, so the set of loaded modules is a good baseline.
  Then we include a couple of additional driver hierarchies, including all filesystems, all HID, input, and USB devices (to make sure we can plug a USB disk with e.g. an NTFS filesystem, even if none was plugged into the running system so far).
  We also include device mapper drivers and the crypto hierarchy to support all kinds of encrypted disks, optionally TPM locked.
  Finally, we also include all virtio drivers, to still be able to test the image in qemu.

  `mkosi` then removes all modules not matching any of these includes, and also removes all firmware binaries not used by any retained modules.

  The resulting image will likely not work on other hardware, but it became a lot smaller:

  ```console
  $ mkosi -f
  […]
  ‣  […]/mkosi.output/archlinux-rescue.efi size is 244.2M, consumes 244.2M.
  ```

  ## Conclusion

  I used to keep a rescue image based on GRML around (see [GRML on ESP](https://wiki.archlinux.org/title/Systemd-boot#Grml_on_ESP)), but stopped doing so once I had a working secure boot setup: GRML ships its initrd and its squash disk image separately, and there were no easy means to combine them into a single image for signing, or sign each part separately.

  With mkosi, I finally have a viable alternative which supports secure boot, and allows me to leave my Arch ISO thumb drive at home.
