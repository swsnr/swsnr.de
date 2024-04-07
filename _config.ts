// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import date from "lume/plugins/date.ts";
import feed from "lume/plugins/feed.ts";
import highlight from "lume/plugins/code_highlight.ts";
import lume from "lume/mod.ts";
import metas from "lume/plugins/metas.ts";
import nunjucks from "lume/plugins/nunjucks.ts";
import readingInfo from "lume/plugins/reading_info.ts";
import relative_urls from "lume/plugins/relative_urls.ts";
import resolve_urls from "lume/plugins/resolve_urls.ts";
import sass from "lume/plugins/sass.ts";
import sitemap from "lume/plugins/sitemap.ts";

import image from "https://deno.land/x/lume_markdown_plugins@v0.7.0/image.ts";

import anchor from "npm:markdown-it-anchor";

import title_from_heading from "./plugins/title-from-content.ts";
import excerpt from "./plugins/excerpt.ts";

import * as globalData from "./src/_data.ts";

const site = lume({
  src: "src",
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

const tagsForArchives = ["archlinux", "emacs", "gnome"];

// Mark production deployment
site.data("isProduction", site.options.location.hostname === "swsnr.de");
// Tags we're interested in for archives
site.data("siteTags", tagsForArchives, "/archives");
// For the index page use the site description as description
site.data("description", globalData.metas.siteDescription, "/index.njk");

// Template engines and styles
site.use(nunjucks());
site.use(sass());

// Sitemap
site.use(sitemap());

// Feeds
site.use(feed({
  output: ["/feed.xml", "/feed.json"],
  query: "type=post !hidden",
  info: {
    title: globalData.metas.site,
    subtitle: globalData.metas.description,
    lang: globalData.metas.lang,
  },
}));
for (const tag of tagsForArchives) {
  site.use(feed({
    output: [`/archives/${tag}.xml`, `/archives/${tag}.json`],
    query: `type=post !hidden ${tag}`,
    info: {
      title: `${globalData.metas.site} – Posts tagged ${tag}`,
      subtitle: globalData.metas.description,
      lang: globalData.metas.lang,
    },
  }));
}

// Global metadata
site.use(metas());

// URLs: Make all internal URLs, and resolve URLs to source files
site.use(relative_urls());
site.use(resolve_urls());

// Code highlighting
site.use(highlight());

// Add filter for date formatting with global date settings
site.use(date());
// Extract page title from first heading
site.use(title_from_heading());
// Generate excerpts and descriptions from contents.
site.use(excerpt());
// Use the first image in page content as social image
site.use(image());
site.use(readingInfo());

// Copy generic assets
site.copy("assets");
site.copy(".well-known");
// Copy images for pages and posts
site.copy("images");

export default site;
