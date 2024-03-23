// Copyright Sebastian Wiesner
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import Site from "lume/core/site.ts";
import { Data, Page } from "lume/core/file.ts";
import { Processor } from "lume/core/processors.ts";

export interface TitleFromHeadingData extends Data {
  /**
   * The extracted excerpt.
   */
  readonly excerpt?: string;
}

const extractMarkdownExcerpt = (page: Page) => {
  if (page.data.excerpt) {
    return;
  }

  if (typeof page.data.content !== "string") {
    return;
  }

  page.data.excerpt = page.data.content.split("<!--more-->", 1)[0];
};

const processMarkdown: Processor = (pages: readonly Page[]) => {
  pages.forEach(extractMarkdownExcerpt);
};

export default () => (site: Site) => {
  site.preprocess([".md"], processMarkdown);
};
