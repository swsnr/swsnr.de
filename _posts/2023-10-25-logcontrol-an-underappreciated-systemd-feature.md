# logcontrol – an underappreciated systemd feature

Systemd has this feature which lets you change the log level of a service on the fly.
You can actually do this:

```console
$ sudo systemctl service-log-level systemd-resolved.service debug
$ resolvectl query some-funky-domain.example.com
$ sudo systemctl service-log-level systemd-resolved.service info
```

to get a debug log of systemd-resolved trying to resolve a specific domain.

This is backed by dbus: If a service listens on dbus and has its bus name defined in its unit file then it can expose the [log control interface](https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.LogControl1.html#) on its bus connection to let systemctl change its log level and log target.

All of systemd's own services support this interface, but unfortunately it hasn't seen wide-spread adoption outside systemd yet.  
Which is kinda sad, because it's really a great feature for debugging.

I certainly plan to use it more, so I put up [logcontrol.rs](https://github.com/swsnr/logcontrol.rs) on crates.io.
