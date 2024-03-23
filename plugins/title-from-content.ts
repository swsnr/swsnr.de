// Copyright Sebastian Wiesner
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import Site from "lume/core/site.ts";
import { Data, Page } from "lume/core/file.ts";
import { Processor } from "lume/core/processors.ts";

export type Mode = "none" | "copy" | "cut";

export interface TitleFromHeadingData extends Data {
  /**
   * Whether to get the title from the first heading.
   */
  readonly titleFromHeading?: Mode;
}

// See https://github.com/benbalter/jekyll-titles-from-headings/blob/bf7a451380bddf6f4bc674600f00c1ef61e29a73/lib/jekyll-titles-from-headings/generator.rb#L7
const titleRegex = /^\s*(?:#{1,3}\s+(.*)(?:\s+#{1,3})?|(.*)\r?\n[-=]+\s*)$/m;

/**
 * Extract page title from the first h1 heading in this page.
 *
 * Optionally strip the heading.
 */
const pageTitleFromMarkdownHeading = (
  page: Page<TitleFromHeadingData>,
) => {
  const { title, titleFromHeading, content } = page.data;
  if (
    title || !content || !titleFromHeading || titleFromHeading == "none"
  ) {
    console.log("SKIPPING", page.sourcePath, page.data);
    // Skip the page if it already has a title or has no content, or if the plugin was disabled for the page.
    return;
  }

  if (typeof content !== "string") {
    console.warn(
      "Ignoring page",
      page.sourcePath,
      "complex content found",
      typeof content,
    );
    return;
  }

  const match = content.match(titleRegex);
  if (match !== null && match[1]) {
    page.data.title = match[1];

    if (titleFromHeading === "cut") {
      // "Cut" the title from the heading, ie strip the heading from the page contents.
      page.data.content = content.replace(titleRegex, "");
    }
  }
};

/**
 * Extract page titles from the first h1 heading of a markdown page.
 */
const titlesFromMarkdownHeading: Processor = (
  pages: readonly Page<TitleFromHeadingData>[],
) => pages.forEach(pageTitleFromMarkdownHeading);

export default () => (site: Site) => {
  site.preprocess([".md"], titlesFromMarkdownHeading);
};
