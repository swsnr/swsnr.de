# Simple Secure Boot in Fedora

Fedora doesn't use a proper secure boot setup: It doesn't use unified kernel images and still leaves unsigned initrd files around.
Generally, it still seems to consider secure boot support just as means to boot and install on secure-boot locked machines with Microsoft's keys, instead of a proper security tool a user should make use of to really own their own machines.

In this article we'll explore how we can setup secure boot with custom keys.
The result works pretty well, and uses no fancy trickery or weird hacks, but is probably still firmly outside of what Fedora supports and will perhaps break with future Fedora releases.

**Note:** I use Fedora 40 in this article; it may or may not apply to other Fedora 40 versions, both earlier and later.
As far as I understand Fedora is actively working on systemd-boot support, UKIs, and secure boot; the whole area is pretty much a moving target and may change a lot in between Fedora releases.

<!--more-->

## Prerequisites

Before we start let's install necessary tooling:

```console
# dnf install systemd-boot-unsigned systemd-ukify sbsigntools
```

We install systemd-boot as our bootloader to replace grub, systemd-ukify to build unified kernel images (UKIs) for signing, and sbsigntools to sign EFI binaries for secure boot.

Let's also put [sbctl] in `~/bin` to generate and enroll keys, and to use `sbctl verify` to check our signatures:

```console
$ curl -LsS https://github.com/Foxboron/sbctl/releases/download/0.13/sbctl-0.13-linux-amd64.tar.gz  | tar xz
$ mkdir -p ~/bin
$ install -m755 sbctl/sbctl ~/bin/sbctl
```

Finally, we confirm that secure boot is in setup mode:

```console
# bootctl status | grep 'Secure Boot'
systemd-boot not installed in ESP.
   Secure Boot: disabled (setup)
```

If secure boot is not in setup mode we need to clear the platform key (PK) from the firmware first, via the firmware interface (e.g. `systemctl reboot --firmware-setup`).

## Replace grub with systemd-boot

As a first step we replace the default grub bootloader with systemd-boot because the latter is considerably simpler to set up and can boot from UKIs without further configuration.

As systemd-boot does not need a separate boot partition we first unmount the boot partition and mount the EFI system partition to the standard `/efi/` mountpoint:

```console
# umount /boot/efi
# umount /boot
# mkdir -Zm755 /efi/
# sed -i 's_/boot/efi_/efi_' /etc/fstab
# sed -i '/\/boot/d' /etc/fstab
# systemctl daemon-reload
# mount -a
```

Now we copy systemd-boot to the ESP, uninstall grub and remove its files from the ESP, and enable a utility service which keeps the systemd-boot up to date on the ESP when the corresponding package gets updated:

```console
# bootctl install
Created "/efi/EFI/systemd".
Created "/efi/loader".
Created "/efi/loader/entries".
Created "/efi/EFI/Linux".
Copied "/usr/lib/systemd/boot/efi/systemd-bootx64.efi" to "/efi/EFI/systemd/systemd-bootx64.efi".
Copied "/usr/lib/systemd/boot/efi/systemd-bootx64.efi" to "/efi/EFI/BOOT/BOOTX64.EFI".
Random seed file /efi/loader/random-seed successfully written (32 bytes).
Successfully initialized system token in EFI variable with 32 bytes.
Created EFI boot entry "Linux Boot Manager".
# dnf remove 'grub*' --setopt protected_packages=
[…]
# rm -rf /efi/EFI/fedora
# systemctl enable systemd-boot-update.service
Created symlink /etc/systemd/system/sysinit.target.wants/systemd-boot-update.service → /usr/lib/systemd/system/systemd-boot-update.service.
```

## Enable UKIs

Next, we'll reconfigure Fedora to build a unified kernel image instead the traditional pair of a kernel image and initramfs.
This creates a single bootable binary to sign for secure boot, instead of leaving an unsigned initramfs around.

Unfortunately, as of 2024-04-12 Fedora 40 [patches dracut's kernel install plugin][1] and breaks its UKI support in doing so.
We obtain the original plugin and overwrite the one included in the package:

```console
$ curl https://raw.githubusercontent.com/dracut-ng/dracut-ng/main/install.d/50-dracut.install > /tmp/50-dracut.install
$ sudo install -m755 -t /etc/kernel/install.d/ /tmp/50-dracut.install
```

Now we can enable UKIs, by creating `/etc/kernel/install.conf` with these contents:

```sh
layout=uki
initrd_generator=dracut
uki_generator=ukify
```

This configuration file changes the kernel installation layout to UKIs, chooses dracut has the initrd generator, and uses `ukify` to combine the kernel and the initrd to a UKI.
While we could use `dracut` for the latter step as well, in my experiments it failed to take the kernel command line from `/etc/kernel/cmdline` into account.
Besides, `ukify` has a handy `ukify inspect` command to inspect the contents of a UKI image, which helps us verify that we build a good image.

We also disable the dracut rescue image because the rescue image setup in Fedora does not yet support UKIs (trying to run the rescue image hook in a UKI setup fails), by creating `/etc/dracut.conf.d/50-no-rescue-image.conf` with the following contents:

```sh
dracut_rescue_image=no
```

## Generate secure boot keys

For secure boot we first need a set of secure boot keys which we generate with `sbctl` (there are probably also tools for this in Fedora, but `sbctl` just makes this very easy):

```console
$ sudo ~/bin/sbctl create-keys
Created Owner UUID baa10157-a096-4bba-9b4d-5ae3f2b84895
Creating secure boot keys...✓ 
Secure boot keys created!
$ sudo ~/bin/sbctl status
Installed:	✓ sbctl is installed
Owner GUID:	baa10157-a096-4bba-9b4d-5ae3f2b84895
Setup Mode:	✗ Enabled
Secure Boot:	✗ Disabled
Vendor Keys:	none
```

## Include the Fedora Secure Boot CA

We also add the Secure Boot Signer CA certificate from Fedora to the secure boot DB which enables us to boot binaries signed by Fedora without having to re-sign them ourselves.
Specifically, Fedora's `fwupd-efi` package comes with a signed EFI binary for fwupd, so firmware updates will just work without further ado if we include the Fedora certificate.

```console
$ sudo dnf install openssl
$ curl https://src.fedoraproject.org/rpms/shim-unsigned-x64/blob/f40/f/fedora-ca-20200709.cer | openssl x509 -inform der -out fedora-ca-20200709.pem
[…]
$ sudo install -m600 -Dt /usr/share/secureboot/keys/custom/db/ fedora-ca-20200709.pem
$ sudo dnf remove openssl
```

## Sign the bootloader

Now we can use our keys to sign the boot loader, and then install the signed binary:

```console
# /usr/bin/sbsign --key /usr/share/secureboot/keys/db/db.key --cert /usr/share/secureboot/keys/db/db.pem /usr/lib/systemd/boot/efi/systemd-bootx64.efi
Signing Unsigned original image
# bootctl install --no-variables
Copied "/usr/lib/systemd/boot/efi/systemd-bootx64.efi.signed" to "/efi/EFI/systemd/systemd-bootx64.efi".
Copied "/usr/lib/systemd/boot/efi/systemd-bootx64.efi.signed" to "/efi/EFI/BOOT/BOOTX64.EFI".
Random seed file /efi/loader/random-seed successfully refreshed (32 bytes).
```

To keep the signed binary up to date when the package gets updated we amend the `systemd-boot-update.service` we enabled above to update the signed binary before updating the ESP.
To this end we use `systemctl edit systemd-boot-update.service --drop-in=10-sbsign` to create a new drop-in with the following contents:

```ini
[Service]
ExecStartPre=/usr/bin/sbsign --key /usr/share/secureboot/keys/db/db.key --cert /usr/share/secureboot/keys/db/db.pem /usr/lib/systemd/boot/efi/systemd-bootx64.efi
```

## Sign UKIs

Next we configure ukify to sign the generated UKIs, by creating `/etc/kernel/uki.conf` with the following contents:

```ini
[UKI]
SecureBootPrivateKey=/usr/share/secureboot/keys/db/db.key
SecureBootCertificate=/usr/share/secureboot/keys/db/db.pem
```

Now we re-install all kernels to install them as signed UKIs on the ESP:

```console
root@fedora-40-test:/home/test# kernel-install add-all --verbose
Loading /etc/kernel/install.conf…
layout=uki set via /etc/kernel/install.conf
INITRD_GENERATOR (dracut) set via /etc/kernel/install.conf.
UKI_GENERATOR (ukify) set via /etc/kernel/install.conf.
Loaded /etc/kernel/install.conf.
[…]
Skipping overridden file '/usr/lib/kernel/install.d/50-dracut.install'.
[…]
dracut: *** Creating initramfs image file '/tmp/kernel-install.staging.ooX3PH/initrd' done ***
[…]
KERNEL_INSTALL_LAYOUT and KERNEL_INSTALL_UKI_GENERATOR are good
Using config file: /etc/kernel/uki.conf
+ sbverify --list /usr/lib/modules/6.8.4-300.fc40.x86_64/vmlinuz
+ sbsign --key /usr/share/secureboot/keys/db/db.key --cert /usr/share/secureboot/keys/db/db.pem /tmp/ukij9govtve --output /tmp/kernel-install.staging.ooX3PH/uki.efi
Signing Unsigned original image
Wrote signed /tmp/kernel-install.staging.ooX3PH/uki.efi
[…]
Installing /tmp/kernel-install.staging.ooX3PH/uki.efi as /efi/EFI/Linux/951d91d766c544f2820cb103358d4de2-6.8.4-300.fc40.x86_64.efi
[…]
Installed 1 kernel(s).
```

## Enroll secure boot keys

Now we can verify that everything is signed:

```console
$ sudo ~/bin/sbctl verify
Verifying file database and EFI images in /efi...
✗ /efi/EFI/BOOT/BOOTIA32.EFI is not signed
✓ /efi/EFI/BOOT/BOOTX64.EFI is signed
✗ /efi/EFI/BOOT/fbia32.efi is not signed
✗ /efi/EFI/BOOT/fbx64.efi is not signed
✓ /efi/EFI/Linux/951d91d766c544f2820cb103358d4de2-6.8.4-300.fc40.x86_64.efi is signed
✓ /efi/EFI/systemd/systemd-bootx64.efi is signed
```

As we can see, all relevant files (the boot loader as well as the kernel image) are signed now (the unsigned files `BOOTIA32.EFI`, `fbia32.efi`, and `fbx64.efi` are left-overs from grub; we can remove these).

Finally, we're ready to enroll our secure boot keys and leave secure boot setup mode:

```console
$ sudo ~/bin/sbctl enroll-keys --custom
Enrolling keys to EFI variables...
With custom keys...✓ 
Enrolled keys to the EFI variables!
```

Note that `sbctl enroll-keys` may abort and very seriously warn you in case it fails to verify the absence of signed option ROMs on your machine.
The warning text describes the available options; in case you happen to see it, **do read it and take it seriously**.

We've now left setup mode, so let's reboot:

```console
# bootctl status | grep 'Secure Boot'
   Secure Boot: disabled
# systemctl reboot 
```

After a reboot secure boot is completely enabled:

```console
$ sudo bootctl | grep 'Secure Boot'
   Secure Boot: enabled (user)
$ sudo ~/bin/sbctl status
Installed:	✓ sbctl is installed
Owner GUID:	baa10157-a096-4bba-9b4d-5ae3f2b84895
Setup Mode:	✓ Disabled
Secure Boot:	✓ Enabled
Vendor Keys:	custom
```

## Configure fwupd

Now that everything works, we should finally configure the firmware updater `fwupd` for our setup.
Normally, `fwupd` tries to load its EFI capsule (the executable it boots into the install the firmware update on a reboot) through shim to support conventional secure boot setups on systems using Microsoft's keys.
However, we don't have shim installed; instead, in our setup we can directly use the signed EFI binary (which is why we included the Fedora CA above).
To convince fwupd to not use shim, we update `/etc/fwupd/fwupd.conf`:

```ini
[fwupd]
# use `man 5 fwupd.conf` for documentation

[uefi_capsule]
EnableGrubChainLoad=false
DisableShimForSecureBoot=true
```

## Conclusion

After a few iterations the whole process came out to be a lot simpler than I anticipated, and I now have fully working useful secure boot on my Fedora system.
I'm positively surprised on how well Fedora follows systemd upstream without too much of custom tooling and patchery (looking at you, Debian…).

The whole secure boot dance also became a lot simpler in the past years.
A few years ago on Arch, `sbctl` changed the game for secure boot (see [Secure boot on Arch Linux with sbctl and dracut](../archlinux/2021-04-01-secure-boot-on-arch-linux-with-sbctl-and-dracut.md)), but these days systemd supports this a lot better with `ukify`, and the remaining gaps are easily filled with good old sbsigntools, to a point that I no longer need sbctl for routine signing of EFI binaries and can solely rely on Fedora packages for this purpose.

That said, I did come across a few oddities in Fedora's packages:

- The dracut package patches out UKI support from the kernel-install hook; however this looks like a faulty patch, and probably gets resolved soon.
  The whole dracut situation is somehwat moving currently with a new upstream emerging after years of stagnation and non-cooperation on the original upstream.
- There is a signed fwupd EFI binary, but no signed systemd-boot binary?
- The signed fwupd binary is part of `fwupd-efi` along with the unsigned binary, but for shim the signed and unsigned binaries are split into different packages (and `systemd-boot-unsigned` suggests this is also planned for systemd-boot)?

But I guess these will resolve soon; the dracut situation will calm down over time, and Fedora actively works to improve UKI support.

[1]: https://src.fedoraproject.org/rpms/dracut/blob/f40/f/0001-feat-kernel-install-do-nothing-when-KERNEL_INSTALL_I.patch
[sbctl]: https://github.com/Foxboron/sbctl
