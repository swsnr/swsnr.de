// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import lume from "lume/mod.ts";
import liquid from "lume/plugins/liquid.ts";
import date from "lume/plugins/date.ts";
import relative_urls from "lume/plugins/relative_urls.ts";
import resolve_urls from "lume/plugins/resolve_urls.ts";
import sass from "lume/plugins/sass.ts";
import metas from "lume/plugins/metas.ts";
import feed from "lume/plugins/feed.ts";

import anchor from "npm:markdown-it-anchor";

import title_from_heading from "./plugins/title-from-content.ts";

import * as globalData from "./src/_data.ts";

const site = lume({
  src: "src",
  location: new URL("https://swsnr.de"),
}, {
  markdown: {
    // Remove default plugins (definition lists, attributes) to improve compatibility with commonmark
    useDefaultPlugins: false,
    // Add anchors to all headings.
    plugins: [[anchor, { level: 2 }]],
    options: {
      breaks: false,
      html: true,
    },
  },
});

// Template engines and styles
site.use(liquid());
site.use(sass());

// Feeds
site.use(feed({
  output: ["/feed.xml", "/feed.json"],
  query: "includeInFeed=true",
  info: {
    title: globalData.metas.site,
    subtitle: globalData.metas.description,
    lang: globalData.metas.lang,
  },
}));

// Global metadata
site.use(metas());

// URLs: Make all internal URLs, and resolve URLs to source files
site.use(relative_urls());
site.use(resolve_urls());

// Add filter for date formatting with global date settings
site.use(date());
// Extract page title from first heading
site.use(title_from_heading());

// Copy generic assets
site.copy("assets");
site.copy(".well-known");
// Copy images for pages and posts
site.copy("images");

export default site;
