# Build Arch Linux packages on OBS

Suse generously sponsors a public build service for packages at <https://build.opensuse.org/>.
Let's try to use it to build Arch packages into a personal repository.

<!--more-->

## Install osc

The build service works best with a local command line tool called `osc`.
Conveniently, the build service itself offers an [Arch repository with binary packages for `osc`][1] which we can just add to `pacman.conf`:

```ini
[openSUSE_Tools_Arch]
Server = https://download.opensuse.org/repositories/openSUSE:/Tools/Arch/$arch/
```

We also need to import and trust the [signing key][2] for this repo:

```console
# xh 'https://build.opensuse.org/projects/openSUSE:Tools/signing_keys/download?kind=gpg' | pacman-key add -
# pacman-key --lsign-key FCADAFC81273B9E7F184F2B0826659A9013E5B65
```

Then we can install `osc` and also `python-keyring` to let `osc` store our password in GNOME keyring:

```console
# pacman -S osc python-keyring
```

## Configure repository

Now we can add an Arch repository to our home project on OBS, by navigating to the "Repositories" tab and checking the "Arch Extra" variant under "Arch distributions".

## Checkout the home project

For simplicity, we'll just go with the "Home" project which every build service user gets.
To start, we check out our home project locally with `osc` (you'll want to replace `swsnr` with your OBS username):

```console
$ osc checkout home:swsnr

Your user account / password are not configured yet.
You will be asked for them below, and they will be stored in
/home/swsnr/.config/osc/oscrc for future use.

Creating osc configuration file /home/swsnr/.config/osc/oscrc ...
Username [api.opensuse.org]: swsnr
Password [swsnr@api.opensuse.org]:

NUM NAME              DESCRIPTION
1   Secret Service    Store password in Secret Service (GNOME Keyring backend) [secure, persistent]
2   Transient         Do not store the password and always ask for it [secure, in-memory]
3   Obfuscated config Store the password in obfuscated form in the osc config file [insecure, persistent]
4   Config            Store the password in plain text in the osc config file [insecure, persistent]
Select credentials manager [default=1]: 1
done
A    home:swsnr
```

As it's the first time we're using `osc` it prompts for authentication.

## Create our first package

Now we can add a new package.
For simplicity, we'll package my favorite font Vollkorn, because it's dead simple and doesn't involve any complex build system.

First, let's create the package and import the `PKGBUILD` from AUR:

```console
$ osc mkpac otf-vollkorn
A    otf-vollkorn
$ cd otf-vollkorn/
$ xh 'https://aur.archlinux.org/cgit/aur.git/plain/PKGBUILD?h=otf-vollkorn' > PKGBUILD
$ osc add PKGBUILD
A    PKGBUILD
```

Let's first edit this `PKGBUILD` to remove the reference to the changelog which we didn't include, and change the license to a proper SPDX license identifier:

```diff
diff --git i/PKGBUILD w/PKGBUILD
index 38de0bc..5cfdd48 100644
--- i/PKGBUILD
+++ w/PKGBUILD
@@ -4,10 +4,9 @@
 pkgname=otf-vollkorn
 pkgdesc="Vollkorn typeface by Friedrich Althausen (OpenType)"
 url='http://vollkorn-typeface.com/'
-license=('OFL')
+license=('OFL-1.1')
 pkgver=4.105
 pkgrel=2
-changelog=ChangeLog.${pkgname}
 arch=('any')

 source=(http://vollkorn-typeface.com/download/vollkorn-${pkgver//./-}.zip)
```

Next we'll fetch, verify, and commit the font source tarball, because the build service builds packages with network access blocked completely, so all sources need to be committed upfront:

```console
$ makepkg --verifysource
==> Making package: otf-vollkorn 4.105-2 (…)
==> Retrieving sources...
  -> Downloading vollkorn-4-105.zip...
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 10.5M  100 10.5M    0     0  6466k      0  0:00:01  0:00:01 --:--:-- 6471k
==> Validating source files with sha256sums...
    vollkorn-4-105.zip ... Passed
$ osc add vollkorn-4-105.zip
A    vollkorn-4-105.zip
```

Now we can commit the package:

```console
$ osc commit -m 'Upload otf-vollkorn'
Sending meta data...
Done.
Sending    otf-vollkorn
Sending    otf-vollkorn/PKGBUILD
Sending    otf-vollkorn/vollkorn-4-105.zip
Transmitting file data ..
Committed revision 1.
```

This transfers the package to the build service, which then starts building it.
The [package page][3] shows the status of the build process, and provides access to the build log.

After the package was built, it moves to the repository and becomes available for download.
Note that the build services queues all these operations, so depending on where your package ends up in the queue and how busy the service is, all of these steps may take a while, so even a fast build might take about an hour to finally end up in the repository.

## Use the package

To use the package we first need to import the signing keys from the project page:

```console
# xh 'https://build.opensuse.org/projects/home:swsnr/signing_keys/download?kind=gpg' | pacman-key add -
# pacman-key --lsign 42D80446DC5C2B66D69DF5B6C1A96AD497928E88
```

Obviously, you'll want to use the key of your own project here.

We also need to tell pacman about the repository by adding it to `pacman.conf`:

```ini
[home_swsnr_Arch]
Server = https://download.opensuse.org/repositories/home:/swsnr/Arch/$arch/
```

Then we can finally install our first package from our own OBS Arch repository:

```console
# pacman -Syu
:: Synchronising package databases...
 home_swsnr_Arch                            […]
:: Starting full system upgrade...
 there is nothing to do
# pacman -S otf-vollkorn
resolving dependencies...
looking for conflicting packages...

Package (1)                   New Version  Net Change

home_swsnr_Arch/otf-vollkorn  4.105-2        5,26 MiB

Total Installed Size:  5,26 MiB

:: Proceed with installation? [Y/n]
[…]
```

Success 🎉

## Final words

Using OBS to build Arch packages turned out to be surprisingly simple, but there's a caveat.

The build services builds all packages strictly without network access, something that few `PKGBUILD`s are prepared for as Arch doesn't have similar restrictions.
For traditional C sources that's not much of an issue, but most modern languages like Go, Rust, ECMAScript, etc. have their own dependency manager and routinely try to pull packages from the internet as part of building.
Getting `PKGBUILD`s for packages written in these languages to build on OBS requires some contortions.  However, I've managed to get Rust software build on OBS with small modifications to `PKGBUILD`, but that's for another post.

Generally, you can't expect OBS to just build arbitrary AUR `PKGBUILD`s; there are other issues, such as OBS failing to resolve alternative dependencies.

But so far I've overcome most of these issues, and certainly plan to use OBS more to build packages for my Arch machines.

[1]: https://build.opensuse.org/project/repository_state/openSUSE:Tools/Arch
[2]: https://build.opensuse.org/projects/openSUSE:Tools/signing_keys
[3]: https://build.opensuse.org/package/show/home:swsnr/otf-vollkorn
