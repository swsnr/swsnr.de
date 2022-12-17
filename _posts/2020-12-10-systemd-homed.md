---
title: systemd-homed
tags: ["archlinux", "systemd", "homed"]
last_modified_at: 2021-07-27T09:56:17+00:00
redirect_from: /systemd-homed/
---

Observations from using systemd-homed for a couple of days:

<!--more-->

* Overall systemd-homed works quite well; I like that my system now boots direct to GDM, no ugly LUKS password prompt anymore, and I like that every user now has an independent encryption password.
* It doesn’t work well with btrfs though: It keeps complaining about having no space left on the device.
* The Newbie Corner of the Arch Linux forums is not so newbie: I found the cause of this issue in [a thread](https://bbs.archlinux.org/viewtopic.php?pid=1922435#p1922435) there.
* Even in Arch Linux it can take a long time for simple bugs to get fixed, see [FS#67685](https://bugs.archlinux.org/task/67658).
* There are still some rough corners: For instance snapperd crashes when it tries to use user data of a homed user, see <https://github.com/openSUSE/snapper/issues/589>.
  * Incidentially even well-intentioned ideas such as clearing a password from memory are hard to get right in C.

All in all I’m quite happy and I really like the idea of homed; I think I’m going to stick with it. I think this and many other ideas from the systemd project are really steps in the right direction.
