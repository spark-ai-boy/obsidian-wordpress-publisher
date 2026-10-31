import type { App, Component, TFile } from "obsidian";
import type {
  PluginData,
  PostStatus,
  PublisherSettings,
  PublishOptions,
  SiteProfile,
  WordPressPost,
  WordPressUser
} from "../types";
import { FRONTMATTER_KEYS, POST_FORMATS, POST_STATUSES } from "../constants";
import { t } from "../i18n";
import { createId } from "../utils/id";
import {
  errorMessage,
  RemoteConflictError,
  WordPressError
} from "../utils/errors";
import {
  isFutureSchedule,
  isValidSchedule,
  nowIso,
  remoteChanged,
  toDateTimeLocal,
  toWordPressDate
} from "../utils/date";
import {
  parseTagList,
  stripMatchingH1,
  stripObsidianComments
} from "../utils/markdown";
import { normalizeSiteUrl } from "../utils/url";
import { htmlToText } from "../utils/html";
import { NoteService } from "./notes";
import { RenderService } from "./renderer";
import { MediaService } from "./media";
import { transformWikiLinks } from "./links";
import { WordPressClient, buildPostInput } from "./client";

export interface PublisherHost {
  app: App;
  getSettings(): PublisherSettings;
  getData(): PluginData;
  persistData(): Promise<void>;
}

export type ProgressCallback = (message: string) => void;

export interface PublishResult {
  post: WordPressPost;
  action: "created" | "updated";
  site: SiteProfile;
  warnings: string[];
}

export class PublisherService {
  private readonly host: PublisherHost;
  private readonly notes: NoteService;
  private readonly renderer: RenderService;

  constructor(host: PublisherHost) {
    this.host = host;
    this.notes = new NoteService(host.app);
    this.renderer = new RenderService(host.app);
  }

  getSettings(): PublisherSettings {
    return this.host.getSettings();
  }

  getSites(): SiteProfile[] {
    return this.getSettings().sites;
  }

  getActiveSite(): SiteProfile | undefined {
    const settings = this.getSettings();
    return (
      settings.sites.find((site) => site.id === settings.activeSiteId) ??
      settings.sites[0]
    );
  }

  getSite(siteId: string | undefined): SiteProfile | undefined {
    if (!siteId) {
      return this.getActiveSite();
    }
    return this.getSettings().sites.find((site) => site.id === siteId);
  }

  createClient(site: SiteProfile): WordPressClient {
    if (!site.username.trim() || !site.applicationPassword.trim()) {
      throw new WordPressError(
        t("notice.credentialsMissing", {
          site: site.name || site.url || "WordPress"
        }),
        { code: "missing_credentials" }
      );
    }
    try {
      return new WordPressClient(site);
    } catch (error) {
      if (error instanceof WordPressError) {
        throw error;
      }
      throw new WordPressError(t("connection.invalidUrl"), {
        code: "invalid_url",
        cause: error
      });
    }
  }

  async testSite(site: SiteProfile): Promise<WordPressUser> {
    if (!site.url.trim()) {
      throw new WordPressError(t("connection.missingUrl"), {
        code: "missing_url"
      });
    }
    return this.createClient(site).testConnection();
  }

  async previewMarkdown(
    file: TFile,
    site: SiteProfile,
    options: PublishOptions
  ): Promise<string> {
    const note = await this.notes.read(file, site, this.getSettings());
    return this.buildPreviewMarkdown(note.body, options);
  }

  async renderPreview(
    file: TFile,
    site: SiteProfile,
    options: PublishOptions,
    container: HTMLElement,
    owner: Component
  ): Promise<void> {
    const markdown = await this.previewMarkdown(file, site, options);
    await this.renderer.renderInto(markdown, file.path, container, owner);
  }

  async quickPublish(
    file: TFile,
    site: SiteProfile,
    onProgress?: ProgressCallback
  ): Promise<PublishResult> {
    const settings = this.getSettings();
    const note = await this.notes.read(file, site, settings);
    const options = this.notes.quickOptions(note, site, settings);

    // Quick publish does not open a dialog, so preserve advanced remote fields
    // instead of resetting them to local defaults.
    if (options.existingPostId) {
      try {
        const client = this.createClient(site);
        const remote = await client.getPost(options.existingPostId);
        if (!note.meta.status) {
          const status = remote.status as PostStatus;
          if (POST_STATUSES.includes(status)) {
            options.status = status;
          }
        }
        if (remote.status === "future" && remote.date) {
          options.status = "future";
          options.scheduledDate = toDateTimeLocal(remote.date);
        }
        if (!note.meta.format) {
          const format = remote.format as PublishOptions["format"];
          if (POST_FORMATS.includes(format)) {
            options.format = format;
          }
        }
        if (!note.meta.categories?.length) {
          options.categoryIds = remote.categories;
        }
        if (!note.meta.tags?.length && remote.tags.length > 0) {
          const tags = await client.getTagsByIds(remote.tags);
          options.tags = parseTagList(
            [...options.tags, ...tags.map((tag) => tag.name)].join(",")
          );
        }
        if (note.meta.featuredMedia === undefined) {
          options.featuredMediaId = remote.featured_media;
        }
        if (!note.slugExplicit && remote.slug) {
          options.slug = remote.slug;
        }
        if (!note.excerptExplicit) {
          options.excerpt = htmlToText(remote.excerpt.rendered);
        }
        options.commentStatus = remote.comment_status ?? options.commentStatus;
        options.pingStatus = remote.ping_status ?? options.pingStatus;
        options.sticky = Boolean(remote.sticky);
      } catch (error) {
        // Only a missing post is safe to recreate. Other failures (auth, network,
        // permissions) must not silently fall back to local defaults.
        if (!(error instanceof WordPressError && error.status === 404)) {
          throw error;
        }
      }
    }

    return this.publish(file, site, options, onProgress);
  }

  async publish(
    file: TFile,
    site: SiteProfile,
    options: PublishOptions,
    onProgress: ProgressCallback = () => undefined
  ): Promise<PublishResult> {
    const settings = this.getSettings();
    const title = options.title.trim();
    if (!title) {
      throw new WordPressError(t("notice.titleRequired"), {
        code: "missing_title"
      });
    }
    if (options.status === "future") {
      if (!options.scheduledDate || !isValidSchedule(options.scheduledDate)) {
        throw new WordPressError(t("notice.scheduleRequired"), {
          code: "missing_schedule"
        });
      }
      if (!isFutureSchedule(options.scheduledDate)) {
        throw new WordPressError(t("notice.scheduleFuture"), {
          code: "schedule_not_future"
        });
      }
    }

    const client = this.createClient(site);
    const note = await this.notes.read(file, site, settings);
    const warnings: string[] = [];
    const tagNames = parseTagList(options.tags.join(","));

    // Detect remote edits before doing any expensive media uploads.
    let existingPostId = options.existingPostId;
    let remotePost: WordPressPost | undefined;
    if (existingPostId) {
      try {
        remotePost = await client.getPost(existingPostId);
      } catch (error) {
        if (error instanceof WordPressError && error.status === 404) {
          existingPostId = undefined;
          warnings.push(t("notice.postMissing"));
        } else {
          throw error;
        }
      }
    }

    if (
      remotePost &&
      settings.detectRemoteChanges &&
      !options.overwriteRemoteChanges &&
      remoteChanged(
        remotePost.modified,
        note.meta.remoteModified,
        note.meta.lastSync
      )
    ) {
      throw new RemoteConflictError(remotePost);
    }

    if (existingPostId && remotePost) {
      if (options.preserveSlug && remotePost.slug) {
        options.slug = remotePost.slug;
      }
      if (options.preserveExcerpt) {
        options.excerpt = htmlToText(remotePost.excerpt.rendered);
      }
    }

    onProgress(t("notice.publishing"));
    let body = stripObsidianComments(note.body);
    if (settings.stripMatchingHeading) {
      body = stripMatchingH1(body, title);
    }

    const media = new MediaService(
      this.host.app,
      client,
      site,
      this.host.getData().mediaCache,
      () => this.host.persistData()
    );
    const prepared = await media.prepareMarkdown(body, file, {
      uploadContentImages: settings.uploadContentImages,
      uploadRemoteImages: settings.uploadRemoteImages,
      onProgress
    });

    if (prepared.localImageCount > 0 && !settings.uploadContentImages) {
      throw new WordPressError(t("notice.localImagesDisabled"), {
        code: "local_images_disabled"
      });
    }
    warnings.push(...prepared.warnings);

    const markdown = transformWikiLinks(
      prepared.markdown,
      this.host.app,
      file.path,
      settings.wikilinkMode
    );
    const rendered = await this.renderer.renderToHtml(markdown, file.path);
    if (rendered.removedLocalImages > 0) {
      warnings.push(
        t("notice.localImagesRemoved", {
          count: rendered.removedLocalImages
        })
      );
    }
    if (!rendered.html.trim()) {
      throw new WordPressError(t("notice.nothingToPublish"), {
        code: "empty_content"
      });
    }

    onProgress(t("notice.publishing"));
    const tagIds = tagNames.length
      ? await client.ensureTags(tagNames)
      : [];

    let featuredMediaId = options.featuredMediaId ?? remotePost?.featured_media;
    let featuredSource = options.featuredImage?.trim() || undefined;
    if (featuredSource) {
      const uploaded = await media.uploadFeatured(
        featuredSource,
        file,
        "",
        onProgress
      );
      featuredMediaId = uploaded.id;
      featuredSource = uploaded.source;
    } else if (options.featuredMediaId === 0) {
      featuredMediaId = 0;
    } else if (
      settings.autoFeaturedImage &&
      prepared.uploadedImages.length > 0
    ) {
      const image = prepared.uploadedImages[0];
      if (image) {
        featuredMediaId = image.id;
        featuredSource = image.source;
      }
    }

    const categoryIds = Array.from(
      new Set(
        options.categoryIds.filter(
          (id) => Number.isInteger(id) && id > 0
        )
      )
    );

    onProgress(t("notice.publishing"));
    const input = buildPostInput({
      title,
      content: rendered.html,
      excerpt: options.excerpt,
      slug: options.slug,
      status: options.status,
      scheduledDate:
        options.status === "future" && options.scheduledDate
          ? toWordPressDate(options.scheduledDate)
          : undefined,
      categoryIds,
      tagIds,
      featuredMediaId,
      format: options.format,
      commentStatus: options.commentStatus,
      pingStatus: options.pingStatus,
      sticky: options.sticky,
      password: options.password,
      clearPassword: options.clearPassword
    });

    const action: "created" | "updated" = existingPostId
      ? "updated"
      : "created";
    const post = existingPostId
      ? await client.updatePost(existingPostId, input)
      : await client.createPost(input);

    try {
      await this.writeFrontmatter({
        file,
        post,
        site,
        options,
        tagNames,
        featuredSource
      });
    } catch (error) {
      warnings.push(
        t("notice.frontmatterUpdateFailed", {
          error: errorMessage(error)
        })
      );
    }

    this.recordHistory(file, post, site, action, title);
    try {
      await this.host.persistData();
    } catch {
      // The remote post exists even if local persistence fails.
    }

    return { post, action, site, warnings };
  }

  private buildPreviewMarkdown(body: string, options: PublishOptions): string {
    const settings = this.getSettings();
    let markdown = stripObsidianComments(body);
    if (settings.stripMatchingHeading) {
      markdown = stripMatchingH1(markdown, options.title.trim());
    }
    return markdown;
  }

  private async writeFrontmatter(context: {
    file: TFile;
    post: WordPressPost;
    site: SiteProfile;
    options: PublishOptions;
    tagNames: string[];
    featuredSource?: string;
  }): Promise<void> {
    const { file, post, site, options, tagNames } = context;
    await this.host.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[FRONTMATTER_KEYS.postId] = post.id;
      frontmatter[FRONTMATTER_KEYS.postUrl] = post.link;
      frontmatter[FRONTMATTER_KEYS.siteUrl] = normalizeSiteUrl(site.url);
      frontmatter[FRONTMATTER_KEYS.status] = post.status;
      frontmatter[FRONTMATTER_KEYS.lastSync] = nowIso();
      frontmatter[FRONTMATTER_KEYS.remoteModified] = post.modified;
      frontmatter[FRONTMATTER_KEYS.categories] = post.categories;
      frontmatter[FRONTMATTER_KEYS.tags] = tagNames;
      frontmatter[FRONTMATTER_KEYS.slug] = post.slug;
      frontmatter[FRONTMATTER_KEYS.format] = post.format;

      if (post.featured_media > 0) {
        frontmatter[FRONTMATTER_KEYS.featuredMedia] = post.featured_media;
      } else {
        delete frontmatter[FRONTMATTER_KEYS.featuredMedia];
      }

      if (context.featuredSource) {
        frontmatter[FRONTMATTER_KEYS.featuredImage] =
          context.featuredSource;
      } else if (options.featuredMediaId === 0) {
        delete frontmatter[FRONTMATTER_KEYS.featuredImage];
      }
    });
  }

  private recordHistory(
    file: TFile,
    post: WordPressPost,
    site: SiteProfile,
    action: "created" | "updated",
    title: string
  ): void {
    const data = this.host.getData();
    const status: PostStatus = POST_STATUSES.includes(post.status as PostStatus)
      ? (post.status as PostStatus)
      : "draft";
    data.history.unshift({
      id: createId(),
      notePath: file.path,
      noteTitle: title,
      postId: post.id,
      postUrl: post.link,
      siteId: site.id,
      siteName: site.name || site.url,
      siteUrl: normalizeSiteUrl(site.url),
      status,
      action,
      timestamp: nowIso()
    });
    data.history = data.history.slice(0, 100);
  }
}
