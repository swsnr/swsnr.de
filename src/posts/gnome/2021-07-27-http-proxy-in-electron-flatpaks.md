# HTTP Proxy in Electron flatpaks

Some electron-based flatpaks (e.g. Mattermost, see [issue 23](https://github.com/flathub/com.mattermost.Desktop/issues/23)) for some reason ignore Gnome’s HTTP proxy settings. In this case we can set the proxy directly inside the affected flatpak.

<!--more-->

We can enter a shell in the flatpak with:

```console
$ flatpak run --command=sh com.mattermost.Desktop
```

In this shell we can set the corresponding Gnome settings with the `gsettings` utility:

```console
$ settings set org.gnome.system.proxy mode manual
$ gsettings set org.gnome.system.proxy.http host REDACTED
$ gsettings set org.gnome.system.proxy.http port REDACTED
$ gsettings set org.gnome.system.proxy.https host REDACTED
$ gsettings set org.gnome.system.proxy.https port REDACTED
```

The corresponding application will then use the proxy correctly.

This issue exists in Standard Notes and Mattermost, but curiously not in Signal even though the Signal client is also an Electron application as far as I know.
