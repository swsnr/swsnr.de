// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

const metas = {
  site: "Sebastian Wiesner",
  siteDescription:
    "System engineer in satellite mission planning. Gnome. Rust. Arch.",
  description: "=description",
  title: "=title",
  lang: "=lang",
  image: "=image",
};

const author = {
  name: "Sebastian Wiesner",
  email: "sebastian@swsnr.de",
};
// Default language and layout
const layout = "layouts/page.njk";
const lang = "en";

// Navlinks for all content
const navLinks = [
  { href: "/archives/", text: "Archive" },
  { href: "/about/", text: "About" },
  { href: "/privacy/", text: "Privacy" },
];

export { author, lang, layout, metas, navLinks };
