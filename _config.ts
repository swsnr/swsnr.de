// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import date from "lume/plugins/date.ts";
import lume from "lume/mod.ts";
import metas from "lume/plugins/metas.ts";
import nunjucks from "lume/plugins/nunjucks.ts";
import relative_urls from "lume/plugins/relative_urls.ts";
import resolve_urls from "lume/plugins/resolve_urls.ts";
import sitemap from "lume/plugins/sitemap.ts";
import icons from "lume/plugins/icons.ts";

import anchor from "npm:markdown-it-anchor";

import title_from_heading from "./plugins/title-from-content.ts";
import excerpt from "./plugins/excerpt.ts";

const site = lume({
  src: "src",
  location: new URL("https://swsnr.de"),
}, {
  markdown: {
    // Remove default plugins (definition lists, attributes) to improve compatibility with commonmark
    useDefaultPlugins: false,
    // Add anchors to all headings.
    plugins: [[anchor, {
      level: 2,
      permalink: anchor.permalink.ariaHidden({ placement: "before" }),
    }]],
    options: {
      breaks: false,
      html: true,
    },
  },
});

site.data("isProduction", Deno.env.get("SWSNR_ENVIRONMENT") == "production");

// Template engine
site.use(nunjucks());

// Sitemap
site.use(sitemap());

// Global metadata
site.use(metas());

// URLs: Make all internal URLs, and resolve URLs to source files
site.use(relative_urls());
site.use(resolve_urls());

// Add filter for date formatting with global date settings
site.use(date());
// Extract page title from first heading
site.use(title_from_heading());
// Generate excerpts and descriptions from contents.
site.use(excerpt());

// Icons
site.use(icons({
  folder: "/assets/icons",
  catalogs: [
    {
      // https://simpleicons.org/
      id: "simpleicons",
      src: "https://cdn.jsdelivr.net/npm/simple-icons@13.16.0/icons/{name}.svg",
    },
  ],
}));

// Copy generic assets
site.copy("assets");
site.copy(".well-known");
// Copy images for pages and posts
site.copy("images");

export default site;
