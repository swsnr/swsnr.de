# Repackaging images with mkosi

In a [fediverse discussion](https://mastodon.social/@swsnr/111834531494882298) following my [last post about mkosi](./2024-01-28-archlinux-rescue-image-with-mkosi.md) I got [nerd-sniped](https://xkcd.com/356/) to [try and repackage](https://mastodon.social/@swsnr/111839356996632453) System Rescue into an USI with `mkosi`.

In this post we'll explore how to do this.

<!--more-->

## Prerequisites

We'll need a few packages first:

```console
# pacman -S mkosi squashfs-tools
# pacman -S --asdeps systemd-ukify qemu-base
```

In addition to `mkosi`, we install its optional dependencies `systemd-ukify` (required to build a UKI) and `qemu-base` (to test with `mkosi qemu`).
We install `squashfs-tools` to extract the root file system from the system-rescue squashfs image with `unsquashfs`.

## Configure mkosi

We start with a simple `mkosi.conf` which enables our desired output format:

```ini
[Distribution]
Distribution=custom

[Output]
Format=uki
ImageId=system-rescue
```

## Get the root file system

Next we download `systemrescue-11.00-amd64.iso` from the System Rescue [download page](https://www.system-rescue.org/Download/).
We mount the ISO, copy `sysresccd/x86_64/airootfs.sfs` to the directory of our `mkosi.conf` file, and extract it (as root to maintain proper file ownership, etc.)

```console
# unsquashfs airootfs.sfs
```

The extracted root file system becomes our base tree for the mkosi image:

```diff
diff --git i/mkosi.conf w/mkosi.conf
index 2b1ad05..297c99c 100644
--- i/mkosi.conf
+++ w/mkosi.conf
@@ -4,3 +4,6 @@ Distribution=custom
 [Output]
 Format=uki
 ImageId=system-rescue
+
+[Content]
+BaseTree=squashfs-root
```

Let's try:

```console
$ mkosi
[…]
‣ A kernel must be installed in the image to build a UKI
```

Looks like there's no kernel in the root file system:

```console
$ ls squashfs-root/lib/modules/6.6.14-1-lts/
kernel/            modules.builtin            modules.builtin.modinfo  modules.devname  modules.symbols
modules.alias      modules.builtin.alias.bin  modules.dep              modules.order    modules.symbols.bin
modules.alias.bin  modules.builtin.bin        modules.dep.bin          modules.softdep  pkgbase
```

Which makes sense: By the time the root file system gets mounted the kernel is already loaded, so System Rescue doesn't waste any space here.

## Get the kernel

So let's copy the kernel from `sysresccd/boot/x86_64/vmlinuz` on the ISO to the directory of our `mkosi` file, and add it on top of the base tree:

```diff
diff --git i/mkosi.conf w/mkosi.conf
index 65f5e5f..7755a27 100644
--- i/mkosi.conf
+++ w/mkosi.conf
@@ -7,3 +7,4 @@ ImageId=system-rescue

 [Content]
 BaseTrees=squashfs-root
+ExtraTrees=vmlinuz:/usr/lib/modules/6.6.14-1-lts/vmlinuz
```

Still not there, though:

```console
$ mkosi -f
mkosi -f
‣ Building system-rescue image
Create subvolume '/var/tmp/mkosi-workspacepbun1nmm/root'
‣  Copying in base trees…
‣  Copying in extra file trees…
‣  Installing systemd-boot…
Failed to resolve path /efi: No such file or directory
‣ "bootctl install --root /var/tmp/mkosi-workspacepbun1nmm/root --all-architectures --no-variables" returned non-zero exit code 1.
```

`mkosi` tries to install bootloader the disk image, but there's no `/efi` directory in the image.
However, we don't need a bootloader inside a USI; instead a USI gets booted by an external bootloader.
So let's disable bootloader installation:

```diff
diff --git i/mkosi.conf w/mkosi.conf
index 7755a27..f501fee 100644
--- i/mkosi.conf
+++ w/mkosi.conf
@@ -8,3 +8,5 @@ ImageId=system-rescue
 [Content]
 BaseTrees=squashfs-root
 ExtraTrees=vmlinuz:/usr/lib/modules/6.6.14-1-lts/vmlinuz
+Bootloader=none
+Bootable=false
```

Now we get an image:

```console
$ mkosi -f
‣  […]/system-rescue.efi size is 909.3M, consumes 909.3M.
```

It's pretty large, but that's not surprising given that we're combining some very large source files:

```console
$ du -h vmlinuz airootfs.sfs
13M     vmlinuz
768M    airootfs.sfs
```

However, we'll need more memory for testing this in a VM than the default 2 GiB `mkosi` uses for its `qemu` command:

```diff
diff --git i/mkosi.conf w/mkosi.conf
index f501fee..9633e9d 100644
--- i/mkosi.conf
+++ w/mkosi.conf
@@ -10,3 +10,6 @@ BaseTrees=squashfs-root
 ExtraTrees=vmlinuz:/usr/lib/modules/6.6.14-1-lts/vmlinuz
 Bootloader=none
 Bootable=false
+
+[Host]
+QemuMem=8G
```

We're choosing 8 GiB because an initramfs of almost 1 GiB will likely use several gigabytes of memory, and we also need a bit of RAM for the system itself.

Let's see if it boots:

```console
$ mkosi qemu
[…]
 ========= SystemRescue 11.00 (x86_64) ======== ttyS0/6 =========
                    https://www.system-rescue.org/

* Console environment :
   Run setkmap to choose the keyboard layout (also accessible with the arrow up key)
   Run manual to read the documentation of SystemRescue

* Graphical environment :
   Type startx to run the graphical environment
   X.Org comes with the XFCE environment and several graphical tools:
   - Partition manager: .. gparted
   - Web browser: ........ firefox
   - Text editor: ........ featherpad

sysrescue login: root (automatic login)

[root@sysrescue ~]#
```

🎉

## Conclusion

This post illustrates some cool `mkosi` features to build your own images of arbitrary root file system trees.
You could use this to e.g. build a USI from the good old [GRML on ESP trick](https://wiki.archlinux.org/title/Systemd-boot#Grml_on_ESP), or repackage any kind of live disk (small enough to live in memory) into a single bootable file.

But for System Rescue specifically this is kind of a futile exercise.
System Rescue is based on Arch Linux, after all, which has first-class `mkosi` support
In its [gitlab repo](https://gitlab.com/systemrescue/systemrescue-sources) we can find its [package list](https://gitlab.com/systemrescue/systemrescue-sources/-/blob/main/packages?ref_type=heads) as well as its [extra file system tree](https://gitlab.com/systemrescue/systemrescue-sources/-/tree/main/airootfs?ref_type=heads), so instead of repackaging its binary artifacts we could just build a `mkosi` image right from its sources.

But that's a story for another blog post.
