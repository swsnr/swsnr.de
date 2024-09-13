# Compose emojis

I just learned a nice trick: On Linux I can actually define custom sequences for the Compose key.

I just need to create a `~/.XCompose` file and can start to define new sequences for e.g. emojis:

```
include "%S/en_US.UTF-8/Compose"

<Multi_key> <period> <p> <r> <a> <y> : "🙏"
<Multi_key> <period> <less> <3> <parenright> : "😍"
<Multi_key> <period> <less> <3> <period> : "❤️"
<Multi_key> <period> <less> <3> <asterisk> : "😘"
```

`man 5 Compose` documents the format, though Gtk doesn’t seem to support all of it: It doesn’t handle includes apparently, and always seems to include its own hard-coded list of compose sequences.

I found [a nice Gist with some sequences](https://gist.github.com/natema/136d4c7a4f3c0ea448b3b2f768831a43), and I started to [write my own](https://github.com/lunaryorn/dotfiles/commit/ed1556ee966e76626211c5bd840bc0f3ac34aadc).
