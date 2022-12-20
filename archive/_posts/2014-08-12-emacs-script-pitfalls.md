---
title: "Emacs script pitfalls"
tags: [emacs]
redirect_from: /2014/08/12/emacs-script-pitfalls.html
---

Emacs isn't just an editor, it’s an entire Emacs Lisp interpreter and
environment.  We can use Emacs Lisp not only to extend and customize our beloved editor, but also to write entire programs and applications.  Nic Ferrier’s [elnode][] server is the most ambitious Emacs Lisp application of this sort, but we can start at a smaller scale and try to write our shell scripts and tools
with Emacs Lisp.

<!--more-->

However, it turns out that writing programs in Emacs Lisp is more intricate than it looks at a first glance.  Emacs decades-long history as interactive application have left deep marks in Emacs and Emacs Lisp, which make independent noninteractive scripts difficult.

[elnode]: https://github.com/nicferrier/elnode

## Making Emacs Lisp scripts executable

In the early days, we’d muck about with `--no-init-file`, `--batch` and `--load` to enter noninteractive mode an.e.d load a file.  Nowadays Emacs has a convenient `--script` option to load and evaluate a specific file, but how to make a proper shebang out of it?  The naive approach won't do:

```cl
#!/usr/bin/emacs --script
(message "Hello world")
```

Emacs is not `/bin/sh`, and its location varies between different systems. There may even be different Emacs versions at different places.  For instance, on OS X `/usr/bin/emacs` is an outdated Emacs 22, and the “real” Emacs is typically installed via Homebrew at `/usr/local/bin/emacs`.

Normally, we'd accommodate these differences with `/usr/bin/env`:

```cl
#!/usr/bin/env emacs --script
(message "Hello world")
```

But this just raises another portability issue:  Linux doesn’t split arguments in the shebang, and sends `emacs --script` as a *single* argument to `/usr/bin/env`, which doesn’t really do the trick.

To make our script executable in a portable and reliable way, we need to resort to some dirty trickery (see <https://stackoverflow.com/a/6259330/355252>):

```bash
#!/bin/sh
":"; exec emacs --script "$0" "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-
(message "Hello world")
```

This wraps the Emacs Lisp code into a POSIX shell script which calls out to `emacs` with appropriate arguments.  The semicolon in the second line hides the `exec` statement from Emacs, and the no-op colon statement turns this into a proper sequence statement for the shell.  The colon in turn is quoted to make it appear as string literal to Emacs Lisp.

Eventually some file local variables tell Emacs to use Emacs Lisp Mode for the script, regardless of the shebang, and to enable lexical binding.

This particularly evil trick works reliably with any POSIX shell.  Even better, we can now pass arbitrary arguments to the `emacs` executable, which allows us to get rid of a little nuisance of `--script`.

## Inhibiting site-start

The [--script][] option is just a shortcut for `--batch -l`, i.e. enter batch mode and load the given file.  Batch Mode mainly means that Emacs will not create a frame, but instead exit after processing all command line arguments (which includes evaluating our script).  Besides, [--batch][] also disables the user initialization file.  However, it still processes the global site initialization file:

> `--batch` implies `-q` (do not load an initialization file), but `site-start.el` is *loaded nonetheless*. It also causes Emacs to exit after processing all the command options. In addition, it disables auto-saving except in buffers for which auto-saving is explicitly requested.

The global site initialization is often a kitchen sink which sets up globally installed packages and adds many seconds to Emacs’ startup time in the worst case.  Besides, it’s not really a good idea to load arbitrary packages before our script even gets a chance to run.

We can opt out of the global site initialization by adding `--quick` to the `emacs` options of our script, which gives us a bare-bones Emacs without any initialization:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-
(message "Hello world")
```

If you need to, you can still load the global site initialization *explicitly* from [site-run-file][srf]:

```cl
(load site-run-file 'no-error 'no-message)
```

[--script]: https://www.gnu.org/software/emacs/manual/html_node/emacs/Initial-Options.html
[--batch]: https://www.gnu.org/software/emacs/manual/html_node/emacs/Initial-Options.html
[srf]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Init-File.html#index-site_002drun_002dfile

## Processing command line arguments ##

Emacs exposes the command line arguments in [command-line-args-left][clal] alias `argv` (not to be confused with [command-line-args][cla] which holds *all* Emacs options, including those that Emacs already interpreted, and is of little use in scripts):

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-

(message "Hello: %S" argv)
```

```
$ ./hello.el 'John Doe'
Hello: ("John Doe")
```

Passing options doesn’t work that well, though:

```
$ ./hello.el --greeting 'Good morning %s!' 'John Doe'
Hello: ("--greeting" "Good morning %s!" "John Doe")
Unknown option `--greeting'
```

Emacs tries to interpret `--greeting` on its own, and rightfully complains that it has never heard of any such option.  How do we keep Emacs away from our options?

The source code of `startup.el`, more precisely the function `command-line-1`, reveals the solution:  Emacs processes all command line arguments *immediately*, in order of their appearance.  After processing, each argument is *removed* from
`argv`, hence the name `command-line-args-left`.

Since `command-line-args-left` aka `argv` is a global variable, we can just remove all remaining arguments from `argv` before our script exits:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-

(message "Hello: %S" argv)
(setq argv nil)
```

```
$ ./hello.el --greeting 'Good morning %s!' 'John Doe'
Hello: ("--greeting" "Good morning %s!" "John Doe")
```

We can also just force Emacs to exit early, which is good style anyway:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-

(message "Hello: %S" argv)
(kill-emacs 0)
```

However, as a reader of this blog pointed out that is still not enough.
Emacs ignores our custom arguments now, but it will still try to process its own.  This means that we can't have a `--version` argument in our script:

```
$ ./hello.el --version
GNU Emacs 25.0.50.1
Copyright (C) 2014 Free Software Foundation, Inc.
GNU Emacs comes with ABSOLUTELY NO WARRANTY.
You may redistribute copies of Emacs
under the terms of the GNU General Public License.
For more information about these matters, see the file named COPYING.
```

Emacs printed its own version and exited before our script even saw the `--version` argument.  We need to use the standard double-dash `--` argument to separate Emacs options from arguments, so that our script can unaffectedly process what Emacs now considers mere arguments (see <https://stackoverflow.com/a/6807133/355252>):

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" -- "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-

(message "Hello: %S" argv)
(kill-emacs 0)
```

Now we get the `--version` argument in our script, but also the separator, so we need to remember to drop the first argument:

```
$ ./hello.el --version
Hello: ("--" "--version")
```

Typically, you’ll process all arguments in a loop, `pop`ing each argument as it is processed.  Initially, you need to pop the first argument to remove the argument separator:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" -- "$@" # -*- mode: emacs-lisp; lexical-binding: t; -*-

(let ((greeting "Hello %s!")
      options-done
      names)
  (pop argv)  ; Remove the -- separator
  (while argv
    (let ((option (pop argv)))
      (cond
       (options-done (push option names))
       ;; Don't process options after "--"
       ((string= option "--") (setq options-done t))
       ((string= option "--greeting")
        (setq greeting (pop argv)))
       ;; --greeting=Foo
       ((string-match "\\`--greeting=\\(\\(?:.\\|\n\\)*\\)\\'" option)
        (setq greeting (match-string 1 option)))
       ((string-prefix-p "--" option)
        (message "Unknown option: %s" option)
        (kill-emacs 1))
       (t (push option names)))

      (unless (> (length greeting) 0)
        (message "Missing argument for --greeting!")
        (kill-emacs 1))))

  (unless names
    (message "Missing names!")
    (kill-emacs 1))

  (dolist (name (nreverse names))
    (message greeting name))

  (kill-emacs 0))
```

Emacs doesn't interfere with our options and arguments any more:

```
$ ./hello.el --greeting='Hello %s' 'John Doe' 'Donald Duck'
Hello John Doe
Hello Donald Duck
```

[clal]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Command_002dLine-Arguments.html#index-command_002dline_002dargs_002dleft
[cla]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Command_002dLine-Arguments.html#index-command_002dline_002dargs

## Standard output and input ##

In the earlier examples, we used `message` to print text in our script. There’s a little issue, though.  We can't properly redirect the output:

```
$ ./hello.el 'John Doe' 'Donald Duck' > /dev/null
Hello John Doe!
Hello Donald Duck!
```

`message` writes to standard *error*, but a good script should use standard output.  For this output stream, there's another, lesser known family of functions: [print][], [prin1][], [princ][] and friends.  These functions output “printed representations” of Lisp objects, with varying levels formatting and quoting.

For simple printing, `princ` is the right candidate, since it prints without any formatting and quoting.  And naturally the unquoted “printed representation” of a string is… the string itself, so we can use this function to print a list of names to standard output:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*-emacs-lisp-*-

(while argv
  (princ (format "Hello %s!" (pop argv)))
  (terpri))

(kill-emacs 0)
```

Unlike `message`, `princ` doesn't take a format string, so we need to call [format][] ourselves.  [terpri][] is a little utility that just prints a
newline.  The result is as expected, and we can also redirect the output now:

```
$ ./hello.el 'John Doe' 'Donald Duck'
Hello John Doe!
Hello Donald Duck!
$ ./hello.el 'John Doe' 'Donald Duck' >/dev/null
```

We have covered standard output now, but what about standard input?  There are no obvious input functions in Emacs Lisp, but the minibuffer reads from standard input in batch mode (see <https://stackoverflow.com/a/2906967/355252>, I’d never
have figured this out by myself):

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*-emacs-lisp-*-

(let (name)
  (while (and (setq name (ignore-errors (read-from-minibuffer "")))
              (> (length name) 0))
    (princ (format "Hello %s!" name))
    (terpri)))

(kill-emacs 0)
```

We read lines from standard input with `read-from-minibuffer`, until an empty string is read, or an error occurs.  EOF, e.g. `C-d` signals an error, so we can exit the input with `C-d` like in other programs.

```
$ ./hello.el
John Doe
Hello John Doe!
Donald Duck
Hello Donald Duck!
```

This has limitations, though.  We can only read whole lines, and don't have direct access to the underlying TTY.  The former doesn't really matter, but the latter limits the graphical capabilities of Emacs scripts and rules out all curses-like stuff or any text UI.

**Watch out!** This also affects password input in Emacs 24 and older: In these versions `read-passwd` reads from standard input in batch mode and thus **exposes** the password input on the terminal.  Only as of Emacs 25 `read-passwd` is safe to use in batch mode.

[print]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Output-Functions.html#index-print
[prin1]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Output-Functions.html#index-prin1
[princ]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Output-Functions.html#index-princ
[format]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Formatting-Strings.html#index-format
[terpri]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Output-Functions.html#index-terpri

## Debugging

By default, Emacs’ error reporting is pretty terse, in interactive mode as well as in batch mode:  It just prints the error message, without any backtraces. Consider this script, which has a little type error inside:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*-emacs-lisp-*-

(message "%S" (+ (car argv) (cadr argv)))
(setq argv nil)
```

The error message isn’t exactly helpful, though:

```
$ ./hello.el 10 20
Wrong type argument: number-or-marker-p, "10"
```

In interactive mode, we debug such errors by simply retrying the command after <kbd>M-x toggle-debug-on-error</kbd>.  Emacs then enters the debugger and creates a backtrace if an error occurs.

In batch mode, we can’t “retry”, though, so we need to enable backtraces right away, by setting [debug-on-error][doe]:

```cl
#!/bin/sh
":"; exec emacs --quick --script "$0" "$@" # -*-emacs-lisp-*-

(setq debug-on-error t)

(message "%S" (+ (car argv) (cadr argv)))

(setq argv nil)
```

Now we get stracktraces for any error:

```
$ ./hello.el 10 20
Debugger entered--Lisp error: (wrong-type-argument number-or-marker-p "10")
  +("10" "20")
  (message "%S" (+ (car argv) (cadr argv)))
  eval-buffer(#<buffer  *load*> nil "/Users/swiesner/Developer/Sandbox/hello.el" nil t)  ; Reading at buffer position 140
  load-with-code-conversion("/Users/swiesner/Developer/Sandbox/hello.el" "/Users/swiesner/Developer/Sandbox/hello.el" nil t)
  load("/Users/swiesner/Developer/Sandbox/hello.el" nil t t)
  command-line-1(("-scriptload" "./hello.el" "10" "20"))
  command-line()
  normal-top-level()
```

[doe]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Error-Debugging.html#index-debug_002don_002derror

## Keep your hands clean

As much as we all love Emacs Lisp, it’s not a language that we should use for scripting or independent programs.  Emacs Lisp is not an independent language and runtime environment.  It’s tied to Emacs, and Emacs is an interactive text editor first and foremost.

I wrote this article partly to help you in the rare cases that you need to write non-interactive Emacs Lisp programs, eg, a runner for your test suite, but even more to show how brittle Emacs Lisp is when used outside Emacs.

Don’t get your hands dirty.  Instead, just use any of the plenty of other languages that are available, eg, Python, Ruby or whatever.  If you want a Lisp, use Common Lisp.  Or try Rust for a change.
