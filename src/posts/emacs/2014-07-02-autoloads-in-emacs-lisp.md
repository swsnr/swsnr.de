# Autoloads in Emacs Lisp

Emacs Lisp offers an [autoloading mechanism][autoload] to load libraries on
demand.  Typically this is used to make interactive commands available to the
user without entirely loading the corresponding library upfront.  This article
explores how autoloads work and how Emacs Lisp packages use autoloads to improve
load speed.

[autoload]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Autoload.html#Autoload

<!--more-->

## Autoloads ##

The [autoload][al] function creates autoloads, for instance for the function
`magit-status` from Magit:

```lisp
(autoload 'magit-status "magit" "Open a Magit status buffer […]" t nil)
```

*Evaluating* this expression tells Emacs to automatically load the library
`magit.el` from `load-path`, when `magit-status` is called for the first
time—either from Lisp, or interactively with `M-x magit-status`.  You can
manually add autoloads to your `init.el` yourself to autoload 3rd party
libraries.  In the old days before package.el, this was a common pattern.

Note the emphasis on *evaluation*.  Merely writing this expression somewhere
doesn't create any autoloads.  Emacs must evaluate it, which comes down to Emacs
loading a file with this expression.

It doesn't make any sense to put autoloads into the same file that has the
actual definition of the autoloaded function.  Emacs would load the rest of the
file as well and thus make the definition available right away, leading the
purpose of autoloads ad absurdum.

Autoloads should be in a separate file containing only autoloads and nothing
else to make it load fast.  Emacs calls such files "autoload files".

## Autoload cookies ##

Maintaining autoload files manually to keep them in sync with the actual
definitions in the library file is tiresome and error-prone so Emacs allows to
automate this process with `update-file-autoloads` and
`update-directory-autoloads`.

`update-file-autoloads` inspects the source files for special comments called
“autoload cookies”.  These cookies let you declare autoloads right at the
corresponding definition.  An autoload cookie for `magit-status` looks like
this:

```lisp
;;;###autoload
(defun magit-status ()
  "Open a Magit status buffer […]"
  (interactive)
  ;; …
)
```

For each such cookie `update-file-autoloads` generates a corresponding
`autoload` like the one shown above, and writes it to the autoload file.
`update-directory-autoloads` performs this process for all files in a directory.

These commands only *generate* autoload files.  You still need to load the
generated files explicitly to make their autoloads available.

If an autoload cookie occurs on an expression with no special support for
autoloading, `update-file-autoloads` copies the expression verbatim.  This is
used to register libraries in specific Emacs extension points, like
`auto-modes-alist`.

## Package autoloads ##

Emacs' package manager `package.el` goes a step further and automatically
generates autoloads files during package installation—internally it simply calls
`update-directory-autoloads`.  This relieves package maintainers from the
tedious work of manually updating autoload files and including them in their
packages, and enables autoloads even for single-file packages[^1].

Likewise `package-initialize` automatically loads autoloads files of all
installed packages to make all autoloads available.

## What to autoload? ##

The general rule is to autoload *interactive “entry points”* of a package.
Examples of interactive entry points include:

- definitions of major and minor modes,
- interactive commands by which a user would start to use a specific package
  (e.g. `gnus`, `erc`, `magit-status`, etc.),
- and interactive commands which offer generic utilities, e.g. `occur`,
  `find`, `ace-jump-mode`, etc.

If your package just provides a library for use in Emacs Lisp code (e.g. like
dash.el or s.el) you should *not* add any autoloads at all.  Libraries are
typically `required`d by dependent libraries so autoloads would be redundant.

If your package should automatically register itself in specific Emacs extension
points you should add autoloads for these as well to make sure that they are
evaluated during package initialization.  A typical example is adding a mode to
`auto-mode-alist`:

```lisp
;;;###autoload
(add-to-list 'auto-mode-alist '("\\.pp\\'" . puppet-mode))
```

This puts `puppet-mode` into `auto-mode-alist` when Emacs starts, so that Puppet
Mode is automatically used for all files ending in `.pp`.

Likewise, colour themes use autoload cookies to add themselves to the color
theme search path:

```lisp
;;;###autoload
(when (and (boundp 'custom-theme-load-path) load-file-name)
  (add-to-list 'custom-theme-load-path
               (file-name-as-directory (file-name-directory load-file-name))))
```

## Emacs Lisp API for autoloads ##

Emacs Lisp has some functions to work with autoloads.  In addition to
[autoload][al] to create autoloads, there are [autoloadp][alp] and
[autoload-do-load][adl].  The first lets you check whether an object is an
autoload object, and the latter loads the underlying library of an autoload.

Both functions work on *autoload objects*, and *not* on symbols with attached
autoloads.  Hence, `(autoloadp 'foo)` checks whether the symbol `foo` is
autoloaded, which it isn't.  Symbols are not loaded at all, they are either
directly created by the reader, or explicitly with [intern][].

To check whether `foo` refers to an autoloaded function you need to check the
*function definition* of `foo`:

```lisp
(autoloadp (function-definition 'foo))
```

[al]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Autoload.html#index-autoload-1
[alp]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Autoload.html#index-autoloadp
[adl]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Autoload.html#index-autoload_002ddo_002dload
[intern]: https://www.gnu.org/software/emacs/manual/html_node/elisp/Creating-Symbols.html#index-intern

[^1]: Single file packages are standalone Emacs Lisp files with special file
      headers.
