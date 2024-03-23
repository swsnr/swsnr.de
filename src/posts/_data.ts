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
const layout = "layouts/post.njk";

/**
 * For posts, take the title from the first heading.
 */
const titleFromHeading = "cut";

/**
 * Mark all posts as such.
 *
 * All posts are shown in archives.  Unless they're tagged "hidden" posts are
 * also shown on the front page and included in the feed.
 */
const type = "post";

export { basename, layout, titleFromHeading, type };
