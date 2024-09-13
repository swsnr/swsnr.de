# Typescript setup for GNOME Shell extensions

The ecosystem for GNOME Shell has come a long way in the last few years. We now have a [comprehensive guide for extension developers](https://gjs.guide/extensions/) and [good API docs](https://gjs-docs.gnome.org/) for the underlying native libraries. The API documentation in GNOME Shell itself is still lacking, but meanwhile its [Javascript source code](https://gitlab.gnome.org/GNOME/gnome-shell/-/tree/main/js?ref_type=heads) is a surprisingly good and readable reference.

With GNOME 45 the shell took another big step: It finally uses ES modules now instead of the legacy import syntax of GJS.  While this causes major breakage for all extensions, requiring every single extension to be ported to the ES modules, it finally enables mostly seamless integration with standard Javascript tooling which is increasingly build around ES modules these days.

Together with another recent tool this means we finally have Typescript for shell extensions!

<!--more-->

## GObject introspection data

The [ts-for-gir](https://github.com/gjsify/ts-for-gir) project provides a CLI which generates types from GObject introspection data. This data describes the native interface of GObject-based libraries, including class hierarchies, argument types, properties, signals, etc., and thus provides all other languages need to know about calling into the corresponding libraries, properly marshalling inputs and outputs, and exposing types to the native library. All libraries in the wider GNOME ecosystem provide this introspection data.  This is the core of what enables GNOME to support a wide range of programming languages for its apps beyond just C, such as Python or Rust.

## Typing generation

Or Javascript: With ts-for-gir we can generate complete Typescript tyings for Gir libraries. We install the tool from the node registry:

```console
$ npm add -D @ts-for-gir/cli
```

Then we create a `.ts-for-girrc.js` file to configure type generation:

```javascript
export default {
  environments: ["gjs"],
  outdir: "@types/gir-generated",
  girDirectories: [
    "/usr/share/gir-1.0",
    "/usr/share/gnome-shell/",
    "/usr/lib/mutter-13",
  ],
  modules: [
    "Gio-2.0",
    "GLib-2.0",
    "GnomeDesktop-4.0",
    "Shell-13",
    "Clutter-13",
    "St-13",
    "Gtk-4.0",
    "Adw-1",
  ],
  ignore: [],
  noNamespace: false,
  buildType: "types",
  moduleType: "esm",
};
```

The paths in this file are for an Arch system; other distributions might choose to install the introspection files in other places. Also note that `ts-for-gir` doesn’t use the compiled and efficiently packed binary typelib files which are used at runtime by e.g. Python to inspect the interface of a library.  It rather needs the introspection **source files** (XML files with a `.gir` extension); most distributions package these separately in -dev or -devel packages.  Hence, I typically commit the generated files to simplify things and not require other contributors to have those Gir files in the right places, or figure things out for their distribution.

In this example we generate types for Gio and GLib, which are the foundational libraries for IO and system access.  Then we include all supporting libraries for GNOME shell (the rendering toolkit clutter, the widget toolkit St, and the GnomeDesktop helper library), and the native Shell library as well.  Finally, we also add in Gtk and Adwaita for use in the preferences widget of the extension.

The types end up in the `@types/gir-generated` directory (and other directory would do too, as long as it matches the `tsconfig.json` contents).

## Typescript

Now let’s add typescript:

```console
$ npm add -D typescript @tsconfig/strictest
```

And configure it in `tsconfig.json`:

```json
{
  "extends": "@tsconfig/strictest/tsconfig.json",
  "compilerOptions": {
    "outDir": "build",
    "target": "ES2022",
    "module": "ES2022",
    "lib": ["ES2022"],
    "removeComments": false,
    "paths": {
      "gi://GObject": ["./@types/gir-generated/gobject-2.0.d.ts"],
      "gi://GLib": ["./@types/gir-generated/glib-2.0.d.ts"],
      "gi://Gio": ["./@types/gir-generated/gio-2.0.d.ts"],
      "gi://Gtk": ["./@types/gir-generated/gtk-4.0.d.ts"],
      "gi://Adw": ["./@types/gir-generated/adw-1.d.ts"],
      "gi://St": ["./@types/gir-generated/st-13.d.ts"],
      "gi://Clutter": ["./@types/gir-generated/clutter-13.d.ts"],
      "gi://GnomeDesktop": ["./@types/gir-generated/gnomedesktop-4.0.d.ts"],

      "resource:///org/gnome/shell/*": ["./@types/gnome-shell/*"],
      "resource:///org/gnome/Shell/Extensions/js/*": ["./@types/gnome-shell/*"]
    },
    "skipLibCheck": false
  },
  "include": [
    "src/**/*.ts",
    // Include GJS global environment types
    "@types/gir-generated/ambient.d.ts",
    "@types/gir-generated/gjs.d.ts",
    "@types/gir-generated/dom.d.ts"
  ],
  "exclude": [".ts-for-girrc.js", ".eslintrc.cjs"]
}
```

We base our config on the strictest preset for maximum type safety. Then we define the language level: Recent Gjs versions support ES2022; if you’d also like to support older versions you need to lower it to ES2020.  GNOME Shell 45 needs at least Gjs 1.73.1, which corresponds to Firefox 91, and does not cover ES2022 completely.  Personally, I don’t care: A distribution which ships GNOME 45 quite likely also ships a recent Gjs version.

We also configure the compiler to retain comments: We’ll have to submit the generated Javascript if we’d like to have our extension on [extensions.gnome.org](https://extensions.gnome.org/), and our comments will help the reviewers which manually check every extension upload to make sure that it’s safe and secure, and neither wrecks havoc of your shell nor steals your credit card data.

Then we map every import URI for the libraries we’d like to use to the corresponding declaration file.  This makes Typescript find the type declarations when we import a library in our extension, e.g.

```javascript
import GLib from "gi://GLib";
```

Unfortunately, the Javascript part of GNOME Shell which we need to interact with to e.g. add panel icons, show notifications, or add system indicators, doesn’t have types (I do really wish that GNOME Shell itself goes Typescript one day, but that’s probably a looooong way of yet).  So we map the GNOME Shell imports to a different set of folders, where we’ll place manual type declarations to describe the shell API we’d like to use.

Now we’re ready to write a `src/extension.ts` file with a typescript extension:

## Further steps

For a serious extension, we need a bit more: Packaging into an extension ZIP file for installation and extensions.gnome.org, settings schemas and a preferences UI, perhaps some icons, and ideally also the translation infrastructure.

I put all this together in a [personal template repository](https://github.com/swsnr/gnome-shell-extension-typescript-template/) which at the time of writing includes:

* this typescript setup,
* eslint and prettier setup,
* a `Makefile` for building, packaging, linting and formatting,
* a settings schema,
* a preference UI defined in [Blueprint](https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/) templates,
* a Github workflow which builds and lints the code, creates an extension artefact for every push (downloadable from the actions page for testing), and automatically creates a release with the extensions artefact attached for a tag push.

It’s still missing translation infrastructure, but I’ll probably add it at some point.

## Further reading

* [Typescript documentation](https://www.typescriptlang.org/docs/)
* [Shell extensions documentation](https://gjs.guide/extensions/)
* [API documentation for Gjs and many libraries](https://gjs-docs.gnome.org/)
* [Blueprint UI compiler](https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/)
* [Workbench](https://github.com/sonnyp/Workbench) (a great tool to prototype UIs with blueprint, with live preview)
