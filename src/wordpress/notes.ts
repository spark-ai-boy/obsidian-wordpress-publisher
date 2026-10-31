import type { App, TFile } from "obsidian";
import type {
  NotePublishMeta,
  PostFormat,
  PostStatus,
  PublisherSettings,
  PublishOptions,
  SiteProfile
} from "../types";
import {
  excerptFromMarkdown,
  extractLeadingH1,
  parseTagList,
  plainText,
  stripFrontmatter,
  stripObsidianComments
} from "../utils/markdown";
import {
  getNoteExcerpt,
  getNoteFeaturedImage,
  getNoteSlug,
  getNoteTags,
  getNoteTitleFromFrontmatter,
  readNoteMeta
} from "../utils/frontmatter";
import { slugify } from "../utils/path";
import { isSameSite } from "../utils/url";

export interface NoteSnapshot {
  file: TFile;
  raw: string;
  /** Markdown body without frontmatter, before title stripping. */
  body: string;
  frontmatter: Record<string, unknown>;
  meta: NotePublishMeta;
  title: string;
  excerpt: string;
  slug: string;
  tags: string[];
  categoryIds: number[];
  featuredImage?: string;
  status: PostStatus;
  format: PostFormat;
  /** True when the slug came from frontmatter rather than a generated slug. */
  slugExplicit: boolean;
  /** True when the excerpt came from frontmatter rather than the body. */
  excerptExplicit: boolean;
  /** True only when the note is linked to the selected site. */
  linkedToSite: boolean;
}

function inlineTags(app: App, file: TFile): string[] {
  const cache = app.metadataCache.getFileCache(file);
  return (cache?.tags ?? [])
    .map((tag) => tag.tag.replace(/^#+/, "").trim())
    .filter(Boolean);
}

export class NoteService {
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  async read(
    file: TFile,
    site: SiteProfile,
    settings: PublisherSettings
  ): Promise<NoteSnapshot> {
    const raw = await this.app.vault.read(file);
    const body = stripFrontmatter(raw);
    const frontmatter =
      (this.app.metadataCache.getFileCache(file)?.frontmatter as
        | Record<string, unknown>
        | undefined) ?? {};
    const meta = readNoteMeta(frontmatter);
    const leading = settings.useFirstHeadingAsTitle
      ? extractLeadingH1(body)
      : null;

    const title =
      plainText(leading?.title ?? "") ||
      getNoteTitleFromFrontmatter(frontmatter) ||
      file.basename;

    const tags = meta.tags?.length
      ? meta.tags
      : settings.useNoteTags
        ? parseTagList(
            [...getNoteTags(frontmatter), ...inlineTags(this.app, file)].join(
              ","
            )
          )
        : [];

    const linkedToSite = meta.siteUrl
      ? isSameSite(meta.siteUrl, site.url)
      : true;
    const explicitExcerpt = getNoteExcerpt(frontmatter);
    const explicitSlug = meta.slug ?? getNoteSlug(frontmatter);

    return {
      file,
      raw,
      body,
      frontmatter,
      meta,
      title,
      excerpt:
        explicitExcerpt ??
        excerptFromMarkdown(stripObsidianComments(body)),
      slug: explicitSlug ?? slugify(title),
      tags,
      categoryIds: meta.categories?.length
        ? meta.categories
        : site.defaultCategoryIds,
      featuredImage:
        meta.featuredImage ?? getNoteFeaturedImage(frontmatter) ?? undefined,
      status: meta.status ?? site.defaultStatus,
      format: meta.format ?? site.defaultFormat,
      slugExplicit: explicitSlug !== undefined,
      excerptExplicit: explicitExcerpt !== undefined,
      linkedToSite
    };
  }

  buildOptions(
    note: NoteSnapshot,
    site: SiteProfile,
    settings: PublisherSettings,
    overrides: Partial<PublishOptions> = {}
  ): PublishOptions {
    const categoryIds =
      overrides.categoryIds ??
      (note.linkedToSite ? note.categoryIds : site.defaultCategoryIds);
    const tags =
      overrides.tags ??
      (note.linkedToSite && note.tags.length ? note.tags : site.defaultTags);
    const status =
      overrides.status ??
      (note.linkedToSite && note.status !== "future"
        ? note.status
        : site.defaultStatus);

    return {
      siteId: site.id,
      title: note.title,
      content: note.body,
      excerpt: note.excerpt,
      slug: note.slug,
      status,
      categoryIds,
      tags,
      featuredImage: note.featuredImage,
      featuredMediaId: note.linkedToSite ? note.meta.featuredMedia : undefined,
      format: note.format,
      commentStatus: settings.defaultCommentStatus,
      pingStatus: settings.defaultPingStatus,
      sticky: false,
      existingPostId: note.linkedToSite ? note.meta.postId : undefined,
      preserveSlug: !note.slugExplicit,
      preserveExcerpt: !note.excerptExplicit,
      ...overrides
    };
  }

  /** Options for a one-click publish, without opening a modal. */
  quickOptions(
    note: NoteSnapshot,
    site: SiteProfile,
    settings: PublisherSettings
  ): PublishOptions {
    const options = this.buildOptions(note, site, settings);
    if (options.status === "future") {
      // Quick publish cannot ask for a date; use the site default instead.
      options.status =
        site.defaultStatus === "future" ? "draft" : site.defaultStatus;
      options.scheduledDate = undefined;
    }
    return options;
  }
}
