export const UPSTREAM_REPOSITORY_SLUG = "Dimillian/CodexMonitor";
export const UPSTREAM_REPOSITORY_URL = `https://github.com/${UPSTREAM_REPOSITORY_SLUG}`;

export const RELEASE_REPOSITORY_SLUG = "jonasjancarik/CodexMonitor";
export const RELEASE_REPOSITORY_URL = `https://github.com/${RELEASE_REPOSITORY_SLUG}`;
export const RELEASES_API_BASE = `https://api.github.com/repos/${RELEASE_REPOSITORY_SLUG}/releases`;
export const RELEASES_WEB_BASE = `${RELEASE_REPOSITORY_URL}/releases`;
export const RELEASE_FEED_URL = `${RELEASES_WEB_BASE}/latest/download/latest.json`;

export const IS_FORK_RELEASE =
  RELEASE_REPOSITORY_SLUG !== (UPSTREAM_REPOSITORY_SLUG as string);
