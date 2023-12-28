# Secure boot on Arch Linux with sbctl and dracut

I started playing around with secure boot, with the ultimately goal of setting it up on my laptop. I experimented in a libvirt/qemu VM and to my surprise a custom secure boot setup is rather easy (the [Secure Boot](https://wiki.archlinux.org/index.php/Unified_Extensible_Firmware_Interface/Secure_Boot#Manual_process) page on the Arch Wiki suggests quite the contrary), thanks to dracut and a fairly recent tool named `sbctl` which just recently had it’s first release.

<!--more-->

## VM Setup

We start with a fresh libvirt VM (you’ll `qemu`, `libvirt`, and `edk2-ovmf`) of a recent Arch Linux ISO using the EFI secure boot firmware provided by the `edk2-ovmf` package at `/usr/share/edk2-ovmf/x64/OVMF_CODE.secboot.fd`; when using virt-manager be sure to edit the configuration before starting the installation and make sure to select this firmware (otherwise you’ll end up in a BIOS-based VM which doesn’t really get far in terms of secure boot). Go through the standard installation process (I have a [custom bootstrap script](https://github.com/lunaryorn/dotfiles/blob/61826f1240901368f9f2432c9a6d892f64bf0099/arch/bootstrap-from-iso.bash) for a quick fresh Arch install with some standard settings); do make sure to install `dracut` for initrd and kernel image generation and setup systemd-boot as the EFI bootloader. Install the `linux-lts` kernel in addition to the standard `linux` kernel; this allows to leave one kernel unsigned after enabling secure boot to verify that booting the unsigned kernel is really forbidden.

Also build unified images right away with `dracut --uefi --kver`; together with systemd partition auto-discovery this avoids the need for dedicated boot loader configuration and already prepares for secure boot (which requires unified EFI binaries).

## Prerequisites

After rebooting check the secure boot state with `bootctl` first to make sure that the firmware supports secure boot:

```console
# bootctl | head
System:
     Firmware: UEFI 2.70 (EDK II 1.00)
  Secure Boot: disabled
   Setup Mode: setup
 Boot into FW: supported

Current Boot Loader:
      Product: systemd-boot 247.4-2-arch
     Features: ✓ Boot counting
               ✓ Menu timeout control
```

Now install `sbctl` to generate and enroll secure boot keys and sign EFI binaries (`pacman -S sbctl`); then check how sbctl sees the secure boot state:

```console
# sbctl  status
==> WARNING: Setup Mode: Enabled
==> WARNING: Secure Boot: Disabled
```

## Key generation

Now we can generate our set of secure boot keys with `sbctl`:

```console
# sbctl create-keys
==> Creating secure boot keys...
  -> Created UUID bb88de62-623a-4450-b256-7c9ffc924f64...
==> Create EFI signature list /usr/share/secureboot/keys/PK/PK.der.esl...
==> Signing /usr/share/secureboot/keys/PK/PK.der.esl with /usr/share/secureboot/keys/PK/PK.key...
==> Create EFI signature list /usr/share/secureboot/keys/KEK/KEK.der.esl...
==> Signing /usr/share/secureboot/keys/KEK/KEK.der.esl with /usr/share/secureboot/keys/PK/PK.key...
==> Create EFI signature list /usr/share/secureboot/keys/db/db.der.esl...
==> Signing /usr/share/secureboot/keys/db/db.der.esl with /usr/share/secureboot/keys/KEK/KEK.key...
```

This command creates all required keys in `/usr/share/secureboot`; on a physical installation it’s probably very advisable to copy the entire contents of the directory to a secure off-site location for backup.

`sbctl verify` now lists all EFI binaries as unsigned:

```console
# sbctl verify
==> Verifying file database and EFI images in /efi...
  -> WARNING: /efi/EFI/BOOT/BOOTX64.EFI is not signed
  -> WARNING: /efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
  -> WARNING: /efi/EFI/Linux/linux-5.11.11-arch1-1-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
  -> WARNING: /efi/EFI/systemd/systemd-bootx64.efi is not signed
```

## Boot loader signatures

Sign the boot loader first:

```console
# sbctl sign -s /efi/EFI/BOOT/BOOTX64.EFI
  -> Signing /efi/EFI/BOOT/BOOTX64.EFI...
# sbctl sign -s /efi/EFI/systemd/systemd-bootx64.efi
  -> Signing /efi/EFI/systemd/systemd-bootx64.efi...
```

Now the boot loader is properly signed:

```console
# sbctl verify
==> Verifying file database and EFI images in /efi...
  -> /efi/EFI/systemd/systemd-bootx64.efi is signed
  -> /efi/EFI/BOOT/BOOTX64.EFI is signed
  -> WARNING: /efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
  -> WARNING: /efi/EFI/Linux/linux-5.11.11-arch1-1-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
```

The `-s` flag stores these paths in an internal `sbctl` database which keeps track of files `sbsign` signed; `sbctl` uses this database in `sbctl sign-all` to refresh the signatures of all files it ever signed. This helps with boot loader updates:

```console
# bootctl update
Copied "/usr/lib/systemd/boot/efi/systemd-bootx64.efi" to "/efi/EFI/systemd/systemd-bootx64.efi".
Copied "/usr/lib/systemd/boot/efi/systemd-bootx64.efi" to "/efi/EFI/BOOT/BOOTX64.EFI".
# sbctl verify
==> Verifying file database and EFI images in /efi...
  -> WARNING: /efi/EFI/BOOT/BOOTX64.EFI is not signed
  -> WARNING: /efi/EFI/systemd/systemd-bootx64.efi is not signed
  -> WARNING: /efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
  -> WARNING: /efi/EFI/Linux/linux-5.11.11-arch1-1-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
# sbctl sign-all
  -> Signing /efi/EFI/systemd/systemd-bootx64.efi...
  -> Signing /efi/EFI/BOOT/BOOTX64.EFI...
# sbctl verify
==> Verifying file database and EFI images in /efi...
  -> /efi/EFI/BOOT/BOOTX64.EFI is signed
  -> /efi/EFI/systemd/systemd-bootx64.efi is signed
  -> WARNING: /efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
  -> WARNING: /efi/EFI/Linux/linux-5.11.11-arch1-1-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is not signed
```

## Signed unified kernel images

To sign the kernel tell dracut about the secure boot keys:

```console
# cat > /etc/dracut.conf.d/50-secure-boot.conf <<EOF
uefi_secureboot_cert="/usr/share/secureboot/keys/db/db.pem"
uefi_secureboot_key="/usr/share/secureboot/keys/db/db.key"
EOF
```

While at it also configure a few other non-essential but still very useful dracut options, to silence the boot process and reduce the size of the images:

```console
# cat > /etc/dracut.conf.d/40-options.conf <<EOF
kernel_cmdline="quiet"
compress="zstd"
hostonly="yes"
EOF
```

With secure boot systemd-boot can no longer set a kernel command line: In this mode systemd-boot uses EFI interfaces to start binaries, to avoid bypassing the signature requirement; this interface does not support for kernel command line arguments. For this reason the desired command line as well as all required initrds must be embedded into a single signed EFI binary, and any command line flags like "quiet" must be set through dracut with the `kernel_cmdline` setting.

Now generate a unified UEFI binary for the LTS kernel:

```console
# dracut --force --uefi --kver 5.10.27-1-lts
dracut: Executing: /usr/bin/dracut --force --uefi --kver 5.10.27-1-lts
…
dracut: *** Creating image file '/efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi' ***
dracut: Using UEFI kernel cmdline:
dracut: quiet
warning: data remaining[25025536 vs 25035138]: gaps between PE/COFF sections?
warning: data remaining[25025536 vs 25035144]: gaps between PE/COFF sections?
Signing Unsigned original image
dracut: *** Creating signed UEFI image file '/efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi' done ***
```

Note the last line: dracut bundled everything into a single EFI file _and_ signed it. `sbctl verify` confirms the new signature:

```console
# sbctl verify
==> Verifying file database and EFI images in /efi...
  -> /efi/EFI/BOOT/BOOTX64.EFI is signed
  -> /efi/EFI/systemd/systemd-bootx64.efi is signed
  -> /efi/EFI/Linux/linux-5.10.27-1-lts-b2f521553ef8449289122ae8d4c2cffe-rolling.efi is signed
```

## Secure boot activation

Now enroll the new secure boot keys into the EFI firmware, check that the firmware left secure boot setup mode:

```console
# sbctl enroll-keys
==> Syncing /usr/share/secureboot/keys to EFI variables...
==> Synced keys!
# sbctl status
==> Setup Mode: Disabled
==> WARNING: Secure Boot: Disabled
```

Now enable the boot loader menu to be able to select a kernel at boot and reboot:

```console
# echo 'timeout 10' >> /efi/loader/loader.conf
# reboot
```

The firmware now prohibits booting the unsigned kernel, but allows the signed kernel:

![secureboot with prohibited and permitted binary](../images/secure-boot-demo.webp)

## Open points

Dracut automates signing kernel images ([dracut-hook-uefi](https://aur.archlinux.org/packages/dracut-hook-uefi) automatically invokes dracut when installing or updating kernel images through pacman), but ensuring proper signatures on the bootloader itself even across updates presents an open issue; ideally there should be some way to call `sbctl sign-all` automatically after `bootctl`.

`sbctl` is also a rather new project, which published a first 0.1 only recently; it remains to be seen how sustainable the project is (I dearly hope it is since it provides a huge improvement over the state of the art secure-boot tooling).
