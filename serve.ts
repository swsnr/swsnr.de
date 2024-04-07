// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import Server from "lume/core/server.ts";
import www from "lume/middlewares/www.ts";
import notfound from "lume/middlewares/not_found.ts";
import redirects from "lume/middlewares/redirects.ts";

const server = new Server({
  port: 8000,
  root: `${Deno.cwd()}/_site`,
});

server.use(www({
  add: false, // false to remove, true to add it.
}));
// Redirect old URLs on lunaryorn.com
const redirectOldUrls = redirects({
  redirects: {
    "/2014/04/15/calling-python-from-haskell": "/calling-python-from-haskell/",
    "/2014/07/02/autoloads-in-emacs-lisp": "/autoloads-in-emacs-lisp/",
    "/2014/08/12/emacs-script-pitfalls/": "/emacs-script-pitfalls/",
  },
});
server.use((request, next, info) => {
  const url = new URL(request.url);
  if (url.hostname === "lunaryorn.com") {
    return redirectOldUrls(request, next, info);
  } else {
    return next(request);
  }
});
server.use(async (request, next) => {
  const url = new URL(request.url);
  if (url.hostname === "lunaryorn.com") {
    // Redirect to new hostname
    url.hostname = "swsnr.de";
    return new Response(null, {
      status: 301,
      headers: {
        location: url.href,
      },
    });
  } else {
    return await next(request);
  }
});
server.use(notfound());

server.start();
