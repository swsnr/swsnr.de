# Anatomy of a GNOME Shell extension in Typescript

This post walks you through a GNOME Shell extension written in Typescript.  
I have a template repository which implements all this at <https://github.com/swsnr/gnome-shell-extension-typescript-template>; for a complete extension based on this template, see <https://github.com/swsnr/gnome-shell-extension-picture-of-the-day/>.

## metadata.json

Every extension starts with a `metadata.json` file:

```json
{
  "name": "My extension",
  "uuid": "my-extension@example.com",
  "description": "A description for my extension.",
  "url": "https://example.com/my-extension",
  "version-name": "1.0.0",
  "shell-version": ["45"]
}
```

## Typescript setup

## Extension entry point

## CI

## Code formatting

## Linting

## Distribution