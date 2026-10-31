import type { TFile } from "obsidian";

/** WordPress core post statuses supported by this plugin. */
export type PostStatus = "draft" | "publish" | "pending" | "private" | "future";

/** WordPress core post formats. */
export type PostFormat =
  | "standard"
  | "aside"
  | "chat"
  | "gallery"
  | "link"
  | "image"
  | "quote"
  | "status"
  | "video"
  | "audio";

export type LanguageSetting = "auto" | "zh" | "en";
export type ResolvedLanguage = "zh" | "en";
export type OpenStatus = "open" | "closed";
export type FeaturedImageMode = "auto" | "none" | "choose";
export type WikilinkMode = "text" | "link";

export interface SiteProfile {
  id: string;
  name: string;
  /** Site root URL, for example https://example.com. */
  url: string;
  username: string;
  applicationPassword: string;
  defaultStatus: PostStatus;
  defaultFormat: PostFormat;
  defaultCategoryIds: number[];
  defaultTags: string[];
}

export interface PublisherSettings {
  language: LanguageSetting;
  sites: SiteProfile[];
  activeSiteId: string;
  /** Use the first H1 in the note as the default post title. */
  useFirstHeadingAsTitle: boolean;
  /** Remove the H1 from the post body when it matches the final title. */
  stripMatchingHeading: boolean;
  /** Pre-fill WordPress tags from the note's YAML tags when no WordPress tags exist. */
  useNoteTags: boolean;
  /** Upload local vault images and replace their links with WordPress media URLs. */
  uploadContentImages: boolean;
  /** Also download and upload remote images referenced by the note. */
  uploadRemoteImages: boolean;
  /** Use the first content image as the featured image when none is selected. */
  autoFeaturedImage: boolean;
  defaultCommentStatus: OpenStatus;
  defaultPingStatus: OpenStatus;
  /** Open the published post in the browser after a successful publish. */
  openPostAfterPublish: boolean;
  showStatusBar: boolean;
  /** Warn before overwriting a post that has changed on WordPress. */
  detectRemoteChanges: boolean;
  wikilinkMode: WikilinkMode;
}

export interface PluginData {
  settings: PublisherSettings;
  history: PublishHistoryEntry[];
  mediaCache: Record<string, MediaCacheEntry>;
}

export interface PublishHistoryEntry {
  id: string;
  notePath: string;
  noteTitle: string;
  postId: number;
  postUrl: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  status: PostStatus;
  action: "created" | "updated";
  timestamp: string;
}

export interface MediaCacheEntry {
  id: number;
  url: string;
  mtime: number;
  size: number;
  alt?: string;
  updatedAt?: number;
}

export interface PublishOptions {
  siteId: string;
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  status: PostStatus;
  /** Local datetime value in the WordPress site's timezone (future posts). */
  scheduledDate?: string;
  categoryIds: number[];
  tags: string[];
  featuredImage?: string;
  featuredMediaId?: number;
  format: PostFormat;
  commentStatus: OpenStatus;
  pingStatus: OpenStatus;
  sticky: boolean;
  password?: string;
  clearPassword?: boolean;
  existingPostId?: number;
  /** Preserve the remote slug when the note has no explicit slug. */
  preserveSlug?: boolean;
  /** Preserve the remote excerpt when the note has no explicit excerpt. */
  preserveExcerpt?: boolean;
  /** User confirmed overwriting a remote post that changed since the last sync. */
  overwriteRemoteChanges?: boolean;
}

export interface WordPressRendered {
  rendered: string;
  protected?: boolean;
}

export interface WordPressPost {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  link: string;
  title: WordPressRendered;
  content: WordPressRendered;
  excerpt: WordPressRendered;
  author: number;
  featured_media: number;
  comment_status: OpenStatus;
  ping_status: OpenStatus;
  sticky: boolean;
  format: string;
  categories: number[];
  tags: number[];
  password?: string;
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

export interface WordPressTag {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface WordPressMedia {
  id: number;
  source_url: string;
  alt_text: string;
  media_type: string;
  mime_type: string;
  title: WordPressRendered;
}

export interface WordPressUser {
  id: number;
  name: string;
  slug: string;
  description: string;
  avatar_urls?: Record<string, string>;
}

export interface WordPressPostInput {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  status: PostStatus;
  date?: string;
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  format?: PostFormat;
  comment_status?: OpenStatus;
  ping_status?: OpenStatus;
  sticky?: boolean;
  password?: string;
}

export interface NotePublishMeta {
  postId?: number;
  postUrl?: string;
  siteUrl?: string;
  status?: PostStatus;
  lastSync?: string;
  remoteModified?: string;
  categories?: number[];
  tags?: string[];
  featuredMedia?: number;
  featuredImage?: string;
  slug?: string;
  format?: PostFormat;
}

export interface PublishContext {
  file: TFile;
  site: SiteProfile;
  settings: PublisherSettings;
  options: PublishOptions;
  noteMeta: NotePublishMeta;
}
