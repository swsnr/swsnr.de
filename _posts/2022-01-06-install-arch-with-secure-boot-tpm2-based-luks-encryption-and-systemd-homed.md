---
title: Install Arch with Secure boot, TPM2-based LUKS encryption, and systemd-homed
tags: ["en_GB", "archlinux", "systemd", "tpm2", "secureboot", "dracut", "luks", "sbctl"]
last_modified_at: 2022-12-01T13:49:28+00:00
redirect_from: /install-arch-with-secure-boot-tpm2-based-luks-encryption-and-systemd-homed
---

This article describes my Arch Linux setup which combines Secure Boot with custom keys, TPM2-based full disk encryption and systemd-homed into a fully encrypted and authenticated, yet convenient Linux system.

This setup draws inspiration from [Authenticated Boot and Disk Encryption on Linux](https://0pointer.net/blog/authenticated-boot-and-disk-encryption-on-linux.html) and [Unlocking LUKS2 volumes with TPM2, FIDO2, PKCS#11 Security Hardware on systemd 248](https://0pointer.net/blog/unlocking-luks2-volumes-with-tpm2-fido2-pkcs11-security-hardware-on-systemd-248.html) by Lennart Poettering, and combines my previous posts [Unlock LUKS rootfs with TPM2 key](https://swsnr.de/unlock-luks-rootfs-with-tpm2-key), [Secure boot on Arch Linux with sbctl and dracut](https://swsnr.de/secure-boot-on-arch-linux-with-sbctl-and-dracut), and [Arch Linux with LUKS and (almost) no configuration](https://swsnr.de/arch-linux-with-luks-and-almost-no-configuration).

<!--more-->

## What this setup does

* Authenticate the boot loader, kernel, initramfs, microcode with Secure Boot, using my own custom keys.  Nothing can boot which wasn’t signed by my keys.
* Everything is either authenticated with my keys (kernel, initramfs, microcode) or encrypted (system partition).
* Encrypt the system partition, and unlock it automatically if the boot process was authenticated, by means of a TPM2 key bound to the secure boot state.
* Give every user their own dedicated encrypted home directory, which gets unlocked at login and locked again at logout.

## What it doesn’t

* Show an ugly LUKS password prompt at boot (even with Plymouth it’s not really pretty).
* Leave some parts unencrypted and unauthenticated (conventional installations often fail to consider the initramfs).
* Ask me twice for my password, once at boot to unlock the disk and then again at login.
* Encrypt data of all users with a shared key.

## Tools used

* **Archlinux**
* **systemd** >= 250
* **systemd-boot** as bootloader
* **systemd** in initramfs to automatically discover and mount the root filesystem
* **dracut** to generate the initramfs and build signed UEFI binaries
* **sbctl** to create and enroll Secure Boot keys, and sign binaries
* **systemd-homed** to manage user accounts with per-user encrypted home directories
* **systemd-cryptenroll** to add TPM2 and recovery keys tokens to a LUKS partition

## The setup

### Install the system

We follow the [Installation Guide](https://wiki.archlinux.org/title/installation_guide) up to and including section [“Update the system clock”](https://wiki.archlinux.org/title/installation_guide#Update_the_system_clock). Then we partition the disk (`/dev/nvme0n1` in our case); we need an EFI system partition of about 500MB and a root partition spanning the rest of the disk. The EFI partition must be unencrypted and have a FAT filesystem; for the root file system we choose btrfs on top of an encrypted partition.

First we partition the disk and reload the partition table; we take care to specify proper partition types (-t option) so that systemd can automatically discover and mount our filesystems without further configuration in `/etc/crypttab` or `/etc/fstab` (see [Discoverable Partitions Specification (DPS)](https://systemd.io/DISCOVERABLE_PARTITIONS/)):

```console
$ target_device=/dev/nvme0n1
$ sgdisk -Z "$target_device"
$ sgdisk -n1:0:+550M -t1:ef00 -c1:EFISYSTEM -N2 -t2:8304 -c2:linux "$target_device"
$ sleep 3
$ partprobe -s "$target_device"
$ sleep 3
```

Then we setup the encrypted partition for the root file system. We get asked for an encryption password where we pick a very simple encryption password (even “password” is good enough for now, really) to save some typing during installation, as we’ll later replace the password with TPM2 key and a random recovery key:

```console
$ cryptsetup luksFormat --type luks2 /dev/disk/by-partlabel/linux
$ cryptsetup luksOpen /dev/disk/by-partlabel/linux root
$ root_device=/dev/mapper/root
```

Now we create the filesystems:

```console
$ mkfs.fat -F32 -n EFISYSTEM /dev/disk/by-partlabel/EFISYSTEM
$ mkfs.btrfs -f -L linux "$root_device"
```

Now we can mount the filesystems and create some basic btrfs subvolumes:

```console
$ mount "$root_device" /mnt
$ mkdir /mnt/efi
$ mount /dev/disk/by-partlabel/EFISYSTEM /mnt/efi
$ for subvol in var var/log var/cache var/tmp srv home; do btrfs subvolume create "/mnt/$subvol" done
```

Now we’re ready to bootstrap Arch Linux: We generate a mirrorlist and install essential packages:

```console
$ reflector --save /etc/pacman.d/mirrorlist --protocol https --latest 5 --sort age
$ pacstrap /mnt base linux linux-firmware intel-ucode btrfs-progs dracut neovim
```

This takes a while to download and installation all packages; afterwards we configure some essential settings. Choose locale settings and the `$new_hostname` according to your personal preferences.

```console
$ ln -sf /usr/share/zoneinfo/Europe/Berlin /mnt/etc/localtime
$ sed -i -e '/^#en_GB.UTF-8/s/^#//' /mnt/etc/locale.gen
$ echo 'LANG=en_GB.UTF-8' >/mnt/etc/locale.conf
$ echo 'KEYMAP=us' >/mnt/etc/vconsole.conf
$ echo "$new_hostname" >/mnt/etc/hostname
```

Now we enter the new system and finish configuration by generating locales, enabling a few essential services and setting a root password:

```console
$ arch-chroot /mnt
$ locale-gen
$ systemctl enable systemd-homed
$ systemctl enable systemd-timesyncd
$ passwd root
```

Still in chroot we now build unified EFI kernel images (including initrd and kernel) for booting and install the systemd-boot boot loader:

```console
$ pacman -S --noconfirm --asdeps binutils elfutils
$ dracut -f --uefi --regenerate-all
$ bootctl install
```

We do _not_ need to create `/etc/fstab` or `/etc/crypttab`; as we assigned the appropriate types to each partition and installed systemd-boot a systemd-based initramfs can automatically determine the disk the system was booted from, and discover all relevant partitions.  It can then use superblock information to automatically open encrypted LUKS devices and mount file systems.

At this point we also need to take care to install everything we need for network configuration after reboot.  For desktop systems I prefer network manager because it integrates well into Gnome:

```console
$ pacman -S networkmanager
```

We have finished the basic setup from the live disk now; let’s leave chroot and reboot:

```console
$ exit
$ reboot
```

After reboot we can complete the system installation, by adding a desktop environment, applications, command line tools, etc.

I like to automate this, and have two bash scripts in my [dotfiles](https://codeberg.org/flausch/dotfiles), one for boostrapping a new system from a live disk ([`arch/bootstrap-from-iso.bash`](https://codeberg.org/flausch/dotfiles/src/branch/main/arch/bootstrap-from-iso.bash)) and another one for installing everything after the initial bootstrapping ([`arch/install.base.bash`](https://codeberg.org/flausch/dotfiles/src/branch/main/arch/install.base.bash)).

### Create homed user

With the installation finished we create our user account with `homectl`; let’s name it `foo` for the purpose of this article. First we should disable copy on write for `/home`, because this file system feature doesn’t work well with large files frequently updated in place, such as disk images of virtual machines or loopback files as created by systemd-homed:

```console
$ chattr +C /home/
```

We now create the `foo` user with an encrypted home directory backed by LUKS and btrfs:

```console
$ homectl create foo --storage luks --fs-type btrfs
```

By default systemd assigns 85% of the available disk space to the user account, and will balance available space among all user accounts (based on a weight we can configure with `—rebalance-weight`). On a single user system we may prefer to set an explicit quota for the user account:

```console
$ homectl resize foo 50G
```

We can also add some additional metadata to the user account:

```console
homectl update foo --real-name 'Foo' --email-address foo@example.org --language en_GB.UTF-8 --member-of wheel
```

`man homectl` provides a complete list of flags; in particular it also offers support for various kinds of security tokens (e.g. FIDO2) for user authentication, provides plenty of means for resource accounting (e.g. memory consumption) for the user account, and supports different kinds of password policies.

Finally we may run into systemd issues with home areas on btrfs (see below); if login fails with a “Operation on home failed: Not enough disk space for home” message we need to enable LUKS discard:

```console
homectl update foo --luks-discard=true
```

This flag is not safe (heed the warning in `man homectl`), but until systemd improves its behaviour on btrfs we have no choice unfortunately.

### Setup secure boot

First let’s check the secure boot state. We must be in Setup Mode in order to enroll our own keys:

```console
$ sbctl status
Installed:	✓ sbctl is installed
Owner GUID:	REDACTED
Setup Mode:	✗ Enabled
Secure Boot:	✗ Disabled
```

To enable secure boot we need some keys which we generate with `sbctl`.  For historical reasons sbctl creates these keys in `/usr/share/secureboot` but plans exists to change this to a more appropriate place (see [Github issue 57](https://github.com/Foxboron/sbctl/issues/57)).

```console
$ sbctl create-keys
```

Now we tell dracut how to sign the UEFI binaries it builds and rebuild our kernel images to get them signed:

```console
$ cat > /etc/dracut.conf.d/50-secure-boot.conf <<EOF
uefi_secureboot_cert="/usr/share/secureboot/keys/db/db.pem"
uefi_secureboot_key="/usr/share/secureboot/keys/db/db.key"
EOF
$ dracut -f --uefi --regenerate-all
```

Next we need to sign the bootloader.  With `-s` we ask `sbctl` to remember this file in its database which later lets us check signatures with `sbctl verify` and automatically update all signatures with `sbctl sign-all`. The `sbctl` package includes a pacman hook which automatically updates signatures when an EFI binary on `/efi` or in `/usr/lib` changed. Note that we do not sign the boot loader on `/efi` but instead place a signed copy in `/usr/lib`.  Starting with systemd 250 `bootctl` will pick up the signed copy when updating the boot loader.  Hence we reinstall the bootloader afterwards to put the signed copy on `/efi`.

```console
$ sbctl sign -s -o /usr/lib/systemd/boot/efi/systemd-bootx64.efi.signed /usr/lib/systemd/boot/efi/systemd-bootx64.efi
$ bootctl install
```

We should also do the same for the firmware update to enable seamless firmware updates under secure boot.  Again we use `-s` to remember this file in the `sbtctl` database:

```console
$ sbctl sign -s -o /usr/lib/fwupd/efi/fwupdx64.efi.signed /usr/lib/fwupd/efi/fwupdx64.efi
```

Now let’s verify that we have all signatures in place and enroll keys if everything’s properly signed:

```console
$ sbctl verify
Verifying file database and EFI images in /efi...
✓ /usr/lib/fwupd/efi/fwupdx64.efi.signed is signed
✓ /usr/lib/systemd/boot/efi/systemd-bootx64.efi.signed is signed
✓ /efi/EFI/BOOT/BOOTX64.EFI is signed
✓ /efi/EFI/Linux/linux-5.15.12-arch1-1-19ea0ebee1ea4de086128ce1a8e2197b-rolling.efi is signed
✓ /efi/EFI/systemd/systemd-bootx64.efi is signed
$ sbctl enroll-keys
```

After a reboot we can check the secure boot state again; we’ll see that setup mode is now disabled, secure boot is on, and everything was properly enrolled:

```console
$ reboot
$ sbctl status
Installed:	✓ sbctl is installed
Owner GUID:	REDACTED
Setup Mode:	✓ Disabled
Secure Boot:	✓ Enabled
```

### Enroll TPM2 keys

With the boot process secured we can now configure automatic unlocking of the root filesystem, by binding a LUKS key to the TPM.

We enable the tpm2-tss module in the Dracut configuration, install the dependencies of this dracut module, and regenerate our UEFI kernel images (which will again be signed for secure boot):

```console
$ cat > /etc/dracut.conf.d/50-tpm2.conf <<EOF
add_dracutmodules+=" tpm2-tss "
EOF
$ pacman -S tpm2-tools
$ dracut -f --uefi --regenerate-all
```

Now we can enroll a TPM2 token (bound to the secure boot measurement in PCR 7) and a recovery key to our root filesystem. This prompts for an existing passphrase each time.  Store the recovery key at a safe place _outside_ of this disk, to have it at hand if TPM2 unlocking ever breaks.

```console
$ systemd-cryptenroll /dev/gpt-auto-root-luks --recovery-key
$ systemd-cryptenroll /dev/gpt-auto-root-luks --tpm2-device=auto
```

Now reboot and enjoy: The boot process goes straight all the way to the login manager and never shows a LUKS password prompt.  The root filesystem is still reasonably secure: The TPM2 key becomes invalid if the secure boot state changes (e.g. new keys are enrolled, or secure boot is disabled), and cannot be recovered if the disk is removed from the system. Consequently only a kernel signed and authenticated with your own secure boot keys can unlock the root disk automatically.

Finally we can wipe the password slots if you like (**make sure to have a recovery key at this point**):

```console
$ systemd-cryptenroll /dev/gpt-auto-root-luks --wipe-slot=password
```

If you cannot use secure boot for some reason you can alternatively bind the TPM2 token to a combination of firmware state and configuration and the exact boot chain (up to and including the specific kernel that was started), by specifing the PCR registers 0-5:

```console
$ systemd-cryptenroll /dev/gpt-auto-root-luks --tpm2-device=auto --tpm2-pcrs 0+1+2+3+4+5
```

This only permits the current kernel and its specific boot chain (e.g bootloader used) to unlock the root filesystem automatically.  However this means that we need to reboot and then wipe and re-enroll the TPM2 token after every rebuild of the kernel image… which happens quite often in fact: Dracut updates or configuration changes, kernel updates, systemd updates (due to the EFI shim provided by systemd), bootloader updates, bootloader configuration changes, etc.

Hence I generally recommend to use secure boot if possible in any way.

## Issues with this setup

While I am happy with this setup it still has a few drawbacks and issues.

### Double encryption

In this setup home directories get encrypted twice, once by homed and then again by the underlying LUKS device.  This wastes a bunch of CPU cycles and likely impacts performance a lot, though I haven’t measured the impact and it’s not so bad as to be noticeable in my day-to-day work.

We could optimize this by putting `/home/` on a separate partition backed by dm-integrity to authenticate the filesystem (omitting dm-integrity and using a plain file system leaves an attack vector, because linux cannot securely mount untrusted file systems).  This setup requires at least systemd 250 or newer, because earlier versions do not support dm-integrity well.  With systemd 250 we can setup a HMAC-based integrity device, put the HMAC key on the rootfs (e.g. `/etc/keys/home.key`) and register the home partition in `/etc/integritytab` with that key, and then mount it via `/etc/fstab`.

However, this has a few issues on its own, because dm-integrity has a few design issues and is and nowhere near LUKS/dm-crypt:

* There’s no key management like LUKS for dm-crypt, meaning we can’t use passphrases or TPM2 keys for dm-integrity devices; instead we need a key file somewhere on disk.
* Unlike LUKS/dm-crypt devices dm-integrity devices aren’t self-describing, because the superblock for dm-integrity doesn’t even contain the algorithm used (see <https://github.com/systemd/systemd/pull/20902#issuecomment-943198835>). We cannot mount a dm-integrity device without some extra configuration, and worse, getting the configuration wrong can silently corrupt the device.
* For these reasons, [DPS](https://systemd.io/DISCOVERABLE_PARTITIONS/) cannot and does not support dm-integrity partitions, so we need to configure the whole home partition mount, from dm-integrity up to `/etc/fstab`.

## Tooling issues

There are also multiple issues with current tooling that require some more or less safe workarounds:

* At the time of writing systemd-home has issues with resizing LUKS home areas on btrfs filesystems, apparently due to `fallocate()` idiosyncrasies in btrfs. This issue prevents users from logging in, see systemd issues [19398](https://github.com/systemd/systemd/issues/19398) and [20960](https://github.com/systemd/systemd/issues/20960), an [Arch forums post](https://bbs.archlinux.org/viewtopic.php?id=258382), and a [mail on the systemd-devel list](https://lists.freedesktop.org/archives/systemd-devel/2020-August/045092.html). A workaround is to enable online discard for the user, but this flag is unsafe because it allows overcommitting disk space, which results in IO errors that the kernel and application are not well prepared to handle (which comes down to potential data loss).  Keep frequent backups if you need this.
