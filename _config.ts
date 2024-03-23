// Copyright Sebastian Wiesner
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import lume from "lume/mod.ts";
import liquid from "lume/plugins/liquid.ts";
import date from "lume/plugins/date.ts";
import relative_urls from "lume/plugins/relative_urls.ts";

import title_from_heading from "./plugins/title-from-content.ts";

const site = lume({
  src: "src",
  location: new URL("https://swsnr.de"),
});

site.use(liquid());
site.use(relative_urls());
site.use(date());
site.use(title_from_heading());

export default site;
