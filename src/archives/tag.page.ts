// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

const tags = ["archlinux", "emacs", "gnome"];

export default function* () {
  for (const tag of tags) {
    yield {
      url: `/archives/${tag}/`,
      query: tag,
      title: `Posts tagged ${tag}`,
    };
  }
}
