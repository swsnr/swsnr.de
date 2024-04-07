// Copyright Sebastian Wiesner <sebastian@swsnr.de>
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

import Server from "lume/core/server.ts";
import www from "lume/middlewares/www.ts";
import notfound from "lume/middlewares/not_found.ts";

const server = new Server({
  port: 8000,
  root: `${Deno.cwd()}/_site`,
});

server.use(www({
  add: false, // false to remove, true to add it.
}));
server.use(notfound());

server.start();
