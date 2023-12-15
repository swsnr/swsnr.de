---
tags: ["dracut", "luks", "sbctl", "archlinux", "systemd", "tpm2", "secureboot"]
last_modified_at: 2022-01-06T16:51:56+00:00
---

# Unlock LUKS rootfs with TPM2 key

Historically cryptsetup and LUKS only supported good old passwords; however recent systemd versions extend cryptsetup with [additional key types](https://0pointer.net/blog/unlocking-luks2-volumes-with-tpm2-fido2-pkcs11-security-hardware-on-systemd-248.html) such as FIDO tokens and TPM devices.

I like the idea of encrypting the rootfs with a TPM2 key; it allows booting without ugly LUKS password prompts but still it keeps data encrypted at rest, and when combined with secure boot also still protects the running system against unauthorized access.

Secure boot will prevent others from placing custom kernels on the unencrypted EFI system partition and booting these, or changing the kernel cmdline, in order to obtain root access to the unlocked rootfs.  LUKS encryption with a TPM-based key bound to secure boot state protects the data if someone removes the hard disk and attempts to access it offline, or tries to disable secure boot in order to boot a custom kernel.

I’ve covered [secure boot setup in a past article](2021-04-01-secure-boot-on-arch-linux-with-sbctl-and-dracut.md); this article talks about the TPM2-based encryption.

<!--more-->

## Enroll TPM key

Check that the system supports TPM2:

```console
$ systemd-cryptenroll --tpm2-device=list
PATH        DEVICE      DRIVER
/dev/tpmrm0 MSFT0101:00 tpm_crb
```

Then enroll a new TPM2 key (use the appropriate block device path of course):

```console
$ systemd-cryptenroll --tpm2-device=auto /dev/disk/by-partlabel/linux
New TPM2 token enrolled as key slot 1.
```

Then add recovery key:

```console
$ systemd-cryptenroll --recovery-key  /dev/disk/by-partlabel/linux
🔐 Please enter current passphrase for disk /dev/disk/by-partlabel/linux:
A secret recovery key has been generated for this volume:

    🔐 efcfbdlt-rhkdjjul-inbhbvhi-nfkvbbbv-didjbjel-butkrrig-ugbrivdd-evnkkkgn

Please save this secret recovery key at a secure location. It may be used to
regain access to the volume if the other configured access credentials have
been lost or forgotten. The recovery key may be entered in place of a password
whenever authentication is requested.
New recovery key enrolled as key slot 2.
```

As suggested save this key in a secure location outside of the system. If TPM2 unlocking fails systemd will prompt for a password where you can enter this key.  This lets us access the data even if the TPM2 key became invalid (e.g. when the secure boot configuration changes).

## Configure dracut

Force dracut to include the TPM2 software stack, by adding /etc/dracut.conf.d/tpm.conf:

```console
add_dracutmodules+=" tpm2-tss "
# And add files dracut currently fails to add, see
# https://github.com/dracutdevs/dracut/issues/1676
install_items+=" /usr/lib/cryptsetup/libcryptsetup-token-systemd-tpm2.so "
```

The last line adds necessary cryptsetup plugins which dracut doesn’t yet add (see <https://github.com/dracutdevs/dracut/issues/1676>).

Make sure to use dracut newer than 055-106-g813577e2; dracut 55 has a typo in the tpm2-tss module dependencies which breaks the module (see <https://github.com/dracutdevs/dracut/pull/1526>), and another issue with systemd-sysusers which interferes with TPM2 support in early boot (see <https://github.com/dracutdevs/dracut/pull/1658>).  As of Dec 2021 you’ll need to install [dracut-git from AUR](https://aur.archlinux.org/packages/dracut-git).

### Reboot and cleanup

Reboot to verify that the system now boots without a LUKS prompt.  Afterwards remove the password key from the rootfs:

```console
$ systemd-cryptenroll --wipe-slot=password /dev/disk/by-partlabel/linux
```

Now the system only unlocks with the TPM2 key or the recovery key.

### Tighten security

Check that

* secure boot is enabled (`bootctl status` or `sbctl status`),
* secure boot uses custom keys,
* all kernels are signed (`sbctl verify`; also check the firmware updater and other relevant EFI binaries), and
* no unsigned initramfs or microcode image is used (at best use bundled UEFI executables).

For users consider to use systemd-homed which offers per-user encrypted home “areas”, backed by LUKS encrypted loopback files.
