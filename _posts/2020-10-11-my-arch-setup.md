---
title: My Arch setup
tags: [archlinux]
last_modified_at: 2021-07-04T10:41:04+00:00
redirect_from: /my-arch-setup/
---

I like Arch Linux and use it for my systems whereever possible. In this post I’ll briefly go through my preferred Arch Linux setup.

<!--more-->

I try to automate as much as possible with [Ansible Playbooks](https://github.com/lunaryorn/dotfiles/tree/main/playbooks).

## Partitioning and file systems

I usally have four partitions:

* A EFI system partition mounted at `/efi`. The size depends: If I create it myself on a pristine system I use 512 MiB, but if I dual boot with Windows I use whatever size it had.
* A extended boot partition mounted at `/boot` for Linux kernels. The size depends on whether the EFI system partition has free space or not. On dual boot systems Windows usually claims a large share of the system paritition so I make the boot parition larger, but it always has at least 512 MiB. This partition also uses FAT32 for EFI compatibility.
* A LUKS-encrypted BTRFS root partition with about 20 to 30 GiB. I usally create dedicated BTRFS subvolumes for directories I want to exclude from snapshots (see below) or put a quota on, e.g.  `/var/tmp`, `/var/cache`, `/var/log`, and `/var/lib/flatpak/repo`.
* A LUKS-encrypted BTRFS home paritition filling the rest of the disk space.

On some systems with plenty of disk space (my work laptop has 2 TB SSD storage) I tend to leave some unpartitioned space or emtpy partitions on the disk, just in case. Sometimes I also add an extra LUKS-encrypted BTRFS partition for `/srv`, on systems which will put a lot of data into this directory.

Despite having three or four dedicated LUKS partitions I only need to enter a single passphrase at boot.  I use the same passphrase for all partitions; systemd asks me only for the passphrase for root, caches it in the kernel keyring on success and uses it to unlock all other partitions. See [`systemd-cryptsetup`](https://www.freedesktop.org/software/systemd/man/systemd-cryptsetup@.service.html) for more inforation.

Every partition has a GUID according to the [Discoverable Partitions Specification](https://systemd.io/DISCOVERABLE_PARTITIONS/). This allows systemd [to automatically discover, unlock and mount](https://www.freedesktop.org/software/systemd/man/systemd-gpt-auto-generator.html#) these partitions so I need neither `/etc/fstab` nor `/etc/crypttab` nor any particular kernel parameters to boot from the encrypted rootfs disk.

I have no swap partition; it’s 2020.

## Bootloader

I use systemd-boot; it does the job and is much simpler to setup and configure than Grub. It can use two partitions for boot images and loader entries: `/efi` and `/boot`; the latter needs to be FAT32 as well for this to work.
By default Arch Linux installs kernels and initramfs images to `/boot`; I do not fiddle with this and create the loader entries for these kernels on `/boot`.

I always put a [GRML rescue system](https://wiki.archlinux.org/index.php/Systemd-boot#Grml_on_ESP) on either of these partitions—not that I need it frequently but it is good to have it at hand just in case Arch Linux becomes unbootable or some messed up update forces me to restore a previous BTRFS snapshot (see below). When dual-booting with Windows I add an extra 512 MiB to `/boot` and put the rescue system there to let Windows have full control of `/efi`, whereas on Linux only systems I put it on `/efi` and use `/boot` only for Arch kernels. The loader entry always looks the same and systemd-boot does not care where the image actually sits.

## Snapshots and backups

One particularly useful feature of btrfs is its ability to take readonly snapshots of any subvolume; this greatly helps backups and recovery. I always setup [snapper](http://snapper.io/), following [Arch’s excellent documentation](https://wiki.archlinux.org/index.php/Snapper). Snapper provides services and timers to automatically take hourly read-only snapshots of BTRFS subvolumes, and helps to manage these or restore previous snapshots.

For my root partition I use a configuration which keeps up to ten weekly snapshots, but I do not bother with monthly or even yearly snapshots:  If I messed up my system so bad that I had to go back an entire year I might just as well reinstall it right away. I only let snapper do hourly snapshots of rootfs because I can anyway, because rootfs does not frequently change. More important for rootfs is snappers ability to take "pre" and "post" snapshots around actions that modify the filesystem. I manually take such snapshots whenever I make "risky" changes to the system, and install [snap-pac](https://github.com/wesbarnett/snap-pac) to automatically take snapshots around pacman updates. This lets me roll back to the previous state of the system should a pacman update leave the system in a broken state.

I also create a snapper configuration for my home directory; here I use the default configuration which keeps up to ten monthly and yearly snapshots. For my home directory I'm less concerned about rolling back entirely, and more about recovering files or directories I accidentally deleted. A nice trick is to take a writeable snapshots as home directory for a second user, to experiment with some software without touching the main user account.

Backups depends very much on the system; for my systems at home I normally just use dejadup (a frontend to [duplicity](https://www.nongnu.org/duplicity/)) to backup to some network storage (e.g. my Synology NAS). Dejadup is not particularly sophisticated but it does the job well and supports encrypted backup and network storage out of the box, which is helpful when the backup storage is not encrypted in and by itself (e.g. Dropbox or a share on a Synology NAS). For other systems I use [snap-sync](https://github.com/wesbarnett/snap-sync) to directly send my snapper snapshots to a LUKS partition on an external drive.

## Desktop

I use Gnome as my primary desktop environment, and actually enjoy Gnome 3.
I do have a working i3 configuration but I scarcly use it and do not even have i3 installed on most of my systems.

## Pacman, flatpak and AUR

I install most packages with Pacman, but rely on Flatpak for some proprietary applications I prefer to have sandboxed, e.g Skype or Steam.

Even though I use AUR packages a lot I do not like fully integrated AUR helpers like `yay`. Instead I put packages I built myself into a local `file:` repository, and rely on [aurutils](https://github.com/AladW/aurutils) to automate this. I normally use `aur sync -c` which builds AUR packages in a clean chroot and adds them to the repo automatically, and then install the package with `pacman` just like a package from the official repositories.

Even though this is a tad more involved than `yay` I find many benefits in this approach. I just use pacman and do not get used to an AUR helper which I would then miss during install or in docker images, I do not have any foreign packages (`pacman -Qm`) on my system, and I can easily `rsync` the repo around, e.g. to a HTTP server to make it available for other Arch systems. This also lets me share built AUR packages between my systems so that I typically only need to build an AUR package once even though I install it on other systems as well. Currently I do this manually but I am looking for ways to automate this.

## Future work

I recently tried [systemd’s home directories](https://systemd.io/HOME_DIRECTORY/). I ran into [some](https://bugs.archlinux.org/task/67658) [issues](https://gitlab.gnome.org/GNOME/gnome-keyring/-/issues/59), and it still does not deliver all it promises. No screen locker yet supports locking the home directory when locking the screen, for instance.

I abandoned homed for now and still use conventional full disk encryption, but I will surely come back to homed once it matured. I really like the idea of encrypting every home directory independently. I think I would perhaps no longer need to encrypt rootfs; most of its contents come from public packages and even configuration files in `/etc` or data i `/var` is usually not confidential.

The real secrets lie in `$HOME` which homed protects better than full disk encryption does. For rootfs integrity protection would be sufficient to detect tampering; combined with secure boot (with personal keys of course) this would likely result in a system that is hard to tamper with even for a determined attacker. A casual attacker (e.g. when my laptop gets lost or stolen) would likely have not chance to tamper with the device or access my data.
