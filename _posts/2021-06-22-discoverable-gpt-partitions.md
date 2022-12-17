---
title: Discoverable GPT partitions
tags: ["archlinux", "systemd"]
last_modified_at: 2021-07-27T09:56:23+00:00
redirect_from: /discoverable-gpt-partitions
---

LWN [recently covered](https://lwn.net/Articles/859240/) a comprehensive guide about [discoverable GPT disk images](http://0pointer.net/blog/the-wondrous-world-of-discoverable-gpt-disk-images.html) by Lennart Poettering.

<!--more-->

I like this feature a lot; in my experience it makes standard setups much simpler and less error prone.

The article illustrates that almost all systemd commands also work on discoverable disk images, which perhaps makes Archlinux installations simpler as well: One can prepare a generic Arch disk image offline, then write it to the block device, run `systemd-firstboot` on it for the necessary customisation, and finally a custom installation script via `systemd-nspawn`.

I'll have to try this next time I install Arch.
