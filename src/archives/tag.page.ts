// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import { Data } from "lume/core/file.ts";

export default function* (data: Data) {
  for (const tag of data.siteTags) {
    const title = `Posts tagged ${tag}`;
    yield {
      url: `/archives/${tag}/`,
      query: tag,
      // TODO: Create a feed for this tag, and use in base.njk for <head> and
      // the link in the footer
      pageFeed: {
        title: `Sebastian Wiesner – ${title}`,
        rssUrl: `/archives/${tag}.xml`,
        jsonUrl: `/archives/${tag}.json`,
      },
      title,
    };
  }
}
