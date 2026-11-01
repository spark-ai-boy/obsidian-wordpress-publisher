import type {
  PostFormat,
  PostStatus,
  PublisherSettings,
  SiteProfile
} from "./types";

export const PLUGIN_ID = "wordpress-publisher-pro";
export const PLUGIN_NAME = "WordPress Publisher";
export const REPO_URL =
  "https://github.com/spark-ai-boy/obsidian-wordpress-publisher";
export const DOCS_URL = `${REPO_URL}#readme`;
export const MAX_HISTORY_ENTRIES = 100;
export const MAX_MEDIA_CACHE_ENTRIES = 500;
export const DEFAULT_CATEGORY_PAGE_SIZE = 100;
export const MAX_CATEGORY_PAGES = 10;

export const POST_STATUSES: PostStatus[] = [
  "draft",
  "publish",
  "pending",
  "private",
  "future"
];

export const POST_FORMATS: PostFormat[] = [
  "standard",
  "aside",
  "chat",
  "gallery",
  "link",
  "image",
  "quote",
  "status",
  "video",
  "audio"
];

export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg"
]);

/** Frontmatter keys written by the plugin. All are optional and user-editable. */
export const FRONTMATTER_KEYS = {
  postId: "wordpress_id",
  postUrl: "wordpress_url",
  siteUrl: "wordpress_site",
  status: "wordpress_status",
  lastSync: "wordpress_last_sync",
  remoteModified: "wordpress_remote_modified",
  categories: "wordpress_categories",
  tags: "wordpress_tags",
  featuredMedia: "wordpress_featured_media",
  featuredImage: "wordpress_featured_image",
  slug: "wordpress_slug",
  format: "wordpress_format"
} as const;

export const DEFAULT_SETTINGS: PublisherSettings = {
  language: "auto",
  sites: [],
  activeSiteId: "",
  useFirstHeadingAsTitle: true,
  stripMatchingHeading: true,
  useNoteTags: true,
  uploadContentImages: true,
  uploadRemoteImages: false,
  autoFeaturedImage: false,
  defaultCommentStatus: "open",
  defaultPingStatus: "open",
  openPostAfterPublish: false,
  showStatusBar: true,
  detectRemoteChanges: true,
  wikilinkMode: "text"
};

export function createSiteProfile(
  id: string,
  overrides: Partial<SiteProfile> = {}
): SiteProfile {
  return {
    id,
    name: "",
    url: "",
    username: "",
    applicationPassword: "",
    defaultStatus: "draft",
    defaultFormat: "standard",
    defaultCategoryIds: [],
    defaultTags: [],
    ...overrides
  };
}
