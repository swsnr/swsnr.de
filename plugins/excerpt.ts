// Copyright Sebastian Wiesner
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import Site from "lume/core/site.ts";
import { Page } from "lume/core/file.ts";

const extractMarkdownExcerpt = (page: Page) => {
  const { content } = page.data;
  if (page.data.excerpt || typeof content !== "string") {
    return;
  }

  page.data.excerpt = content.split("<!--more-->", 1)[0];
};

const extractMarkdownDescription = async (site: Site, page: Page) => {
  const { excerpt } = page.data;
  if (page.data.description || typeof excerpt !== "string") {
    return;
  }
  // Render the excerpt and strip out all tags, then take the 100 first words.
  const rawText = await site.renderer.render<string>(
    `{{ excerpt | md() | striptags() }}`,
    {
      templateEngine: "njk",
      excerpt,
    },
    "",
  );
  const description = rawText.split(/\s+/).slice(0, 100).join(" ");
  page.data.description = description.length < rawText.length
    ? `${description}…`
    : description;
};

export default () => (site: Site) => {
  site.preprocess([".md"], async (pages: readonly Page[]) => {
    for (const page of pages) {
      extractMarkdownExcerpt(page);
      await extractMarkdownDescription(site, page);
    }
  });
};
