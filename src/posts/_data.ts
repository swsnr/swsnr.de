// Copyright Sebastian Wiesner
//
// This Source Code Form is subject to the terms of the Mozilla Public License,
// v. 2.0.  If a copy of the MPL was not distributed with this file, You can
// obtain one at https://mozilla.org/MPL/2.0/.

/**
 * Strip posts/ from post URLs, to place all posts into the top level.
 */
const basename = "../";

/**
 * Render all posts with the post layout.
 */
const layout = "layouts/post.liquid";

/**
 * For posts, take the title from the first heading.
 */
const titleFromHeading = "cut";

/**
 * Include all posts in the feed.
 *
 * See _config.ts for feed configuration.
 */
const includeInFeed = true;

export { basename, includeInFeed, layout, titleFromHeading };
