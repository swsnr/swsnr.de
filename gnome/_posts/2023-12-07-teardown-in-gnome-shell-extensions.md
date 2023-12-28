# Teardown in GNOME Shell extensions

GNOME Shell extensions can get disabled any time for various reasons, so it's essential to properly clean up the entire extension state when an extension gets disabled.  GNOME Shell doesn't provide a lot of infrastructure for this purpose, tho, so let's roll our own pattern for properly destroying a GNOME Shell extension in Typescript.

<!--more-->

## A destructible object

Let's start with the most generic interface of a destructible object:

```typescript
export interface Destructible {
  destroy(): void;
}
```

We're using `destroy()` (as opposed to, e.g. `dispose()`) because that's the terminology used in GNOME Shell, by means of [`Clutter.Actor.destroy`](https://gjs-docs.gnome.org/clutter13~13/clutter.actor#method-destroy).  Calling our method `destroy()` means that every actor (aka widget) we define automatically implements our interface.

## Destroyer of many things

Based on this we can define an object to keep track off multiple things to destroy:

```typescript
export class Destroyer implements Destructible {
  private readonly destructibles: Destructible[] = [];

  add<T extends Destructible>(destructible: T): T {
    this.destructibles.push(destructible);
    return destructible;
  }

  destroy(): void {
    let destructible: Destructible | undefined;
    while ((destructible = this.destructibles.pop())) {
      try {
        destructible.destroy();
      } catch (error) {
        console.error("Failed to destroy object", destructible, error);
      }
    }
  }
}
```

In this object we can track every object our extension needs to destroy when it gets disabled, and then destroy all those objects all at once with a single call.

### Initialize, but safely

On top of our `Destroyer` we can implement an own base class for a destructible extension which captures the boilerplate required to keep track of some extension state that needs to be destroyed:

```typescript
export const initializeSafely = (
  initialize: (destroyer: Destroyer) => void,
): Destructible => {
  const destroyer = new Destroyer();
  try {
    initialize(destroyer);
  } catch (error) {
    destroyer.destroy();
    throw error;
  }

  return destroyer;
};

export abstract class DestructibleExtension extends Extension {
  private enabledExtension?: Destructible | null;

  abstract initialize(destroyer: Destroyer): void;

  override enable(): void {
    if (!this.enabledExtension) {
      this.enabledExtension = initializeSafely((destroyer) => {
        this.initialize(destroyer);
      });
    }
  }

  override disable(): void {
    this.enabledExtension?.destroy();
    this.enabledExtension = null;
  }
}
```

The little `initializeSafely` provides a destroyer to track destructible objects in to the inner function, and makes sure to destroy it should the inner function fail. This ensures that enabling our extension never leaks any resources even if the `initialize` implementation fails half way through.

### The extension

When implementing our extension we no longer need to track state in class attributes ourselves in `enable()` and destroy it meticulously in `disable()`.  Instead, we just implement initialization, and only need to pay attention to track all objects in the given `destroyer`:

```typescript
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

export default class ExampleExtension extends DestructibleExtension {
    initialize(destroyer: Destroyer): void {
        const indicator = destroyer.add(
          new PanelMenu.Button(0.0, this.metadata.name, false)
       );

        // We don't need to track this in destroyer, because
        // it's already tracked by it's parent actor in "indicator"
        const icon = new St.Icon({
            icon_name: 'face-laugh-symbolic',
            style_class: 'system-status-icon',
        });
        indicator.add_child(icon);

        Main.panel.addToStatusArea(this.uuid, indicator);

        // We can conveniently add any kind of function to the destroyer,
        // to be invoked when the extension gets disabled.
        destroyer.add({
            destroy() {
                console.log("Good bye");
            },
        });
    }
}
```

For a real world example, see [extension.ts][1] of my [Picture of the Day extension](https://github.com/swsnr/gnome-shell-extension-picture-of-the-day).

[1]: https://github.com/swsnr/gnome-shell-extension-picture-of-the-day/blob/13e6f212ae7bf8e1775254b1300e4ebedd459d97/src/extension.ts

## Common destructibles

In addition to objects which are already destructible, namely all our widgets, we can also use this interface to clean up some other resources.

For instance, we can track signal connections and property bindings of GObjects to disconnect either when destroyed; this avoids leaking resources in reference cycles created by mutual signal connections or property bindings:

```typescript
export class SignalConnectionTracker implements Destructible {
  private readonly signals: [GObject.Object, number][] = [];

  track(obj: GObject.Object, id: number): void {
    this.signals.push([obj, id]);
  }

  destroy(): void {
    let signalConnection: [GObject.Object, number] | undefined;
    while ((signalConnection = this.signals.pop())) {
      const [obj, signal] = signalConnection;
      obj.disconnect(signal);
    }
  }
}

export class BindingTracker implements Destructible {
  private readonly bindings: GObject.Binding[] = [];

  add(binding: GObject.Binding): GObject.Binding {
    this.bindings.push(binding);
    return binding;
  }

  destroy(): void {
    let binding: GObject.Binding | undefined;
    while ((binding = this.bindings.pop())) {
      binding.unbind();
    }
  }
}

initialize(destroyer: Destroyer): void {
  const signals = destroyer.add(new SignalConnectionTracker());
  const bindings = destroyer.add(new BindingTracker());

  signalTracker.track(
    settings,
    settings.connect("changed::my-setting", () => {
      mySettingHasChanged();
    }),
  );

  bindings.add(
    dateMenu._clock.bind_property(
      "clock",
      clockLabel,
      "wallClock",
      GObject.BindingFlags.SYNC_CREATE,
    ),
  );
}
```
