import { App, Component, Modal, Notice, Setting } from "obsidian";
import type WordPressPublisherPlugin from "../main";
import type {
  OpenStatus,
  PostFormat,
  PostStatus,
  PublishOptions,
  SiteProfile,
  WordPressCategory,
  WordPressPost
} from "../types";
import {
  FRONTMATTER_KEYS,
  POST_FORMATS,
  POST_STATUSES
} from "../constants";
import { t, formatLabel, getLanguage, statusLabel } from "../i18n";
import {
  defaultScheduleValue,
  formatDateTime,
  isFutureSchedule,
  isValidSchedule,
  remoteChanged,
  toDateTimeLocal
} from "../utils/date";
import { errorMessage, RemoteConflictError } from "../utils/errors";
import { firstImageSource } from "../utils/images";
import { parseTagList } from "../utils/markdown";
import { htmlToText } from "../utils/html";
import { slugify as makeSlug } from "../utils/path";
import { isSafeExternalUrl, isSameSite } from "../utils/url";
import { NoteService, type NoteSnapshot } from "../wordpress/notes";
import { ImageSuggestModal } from "./image-suggest";

type Tab = "details" | "preview";

interface PublishState {
  title: string;
  status: PostStatus;
  scheduledDate: string;
  slug: string;
  slugEdited: boolean;
  excerpt: string;
  excerptEdited: boolean;
  categoryIds: Set<number>;
  tags: string;
  featuredImage: string;
  featuredMediaId?: number;
  format: PostFormat;
  commentStatus: OpenStatus;
  pingStatus: OpenStatus;
  sticky: boolean;
  password: string;
  clearPassword: boolean;
  overwriteConflicts: boolean;
  tab: Tab;
}

function categoryDepths(
  categories: WordPressCategory[]
): Map<number, number> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const depths = new Map<number, number>();

  for (const category of categories) {
    let level = 0;
    let parent = category.parent;
    const seen = new Set<number>();
    while (parent && level < 6 && !seen.has(parent)) {
      seen.add(parent);
      const next = byId.get(parent);
      if (!next) {
        break;
      }
      level += 1;
      parent = next.parent;
    }
    depths.set(category.id, level);
  }

  return depths;
}

export class PublishModal extends Modal {
  private readonly plugin: WordPressPublisherPlugin;
  private readonly file: import("obsidian").TFile;
  private readonly notes: NoteService;
  private sites: SiteProfile[] = [];
  private site!: SiteProfile;
  private note!: NoteSnapshot;
  private state!: PublishState;
  private existingPostId: number | undefined;
  private remotePost: WordPressPost | undefined;
  private remoteMissing = false;
  private remoteError = "";
  private conflict = false;
  private categories: WordPressCategory[] = [];
  private categoriesLoaded = false;
  private categoriesLoading = false;
  private categoryError = "";
  private categoryQuery = "";
  private categoryListEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private busy = false;
  private statusMessage = "";
  private previewOwner: Component | null = null;
  private readonly initialTab: Tab;

  constructor(
    app: App,
    plugin: WordPressPublisherPlugin,
    file: import("obsidian").TFile,
    initialTab: Tab = "details"
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.notes = new NoteService(app);
    this.initialTab = initialTab;
  }

  onOpen(): void {
    this.modalEl.addClass("wordpress-publisher-publish-modal");
    this.setTitle(t("publish.titleCreate"));
    this.contentEl.createDiv({
      cls: "wp-loading",
      text: t("common.loading")
    });
    void this.initialize();
  }

  onClose(): void {
    this.previewOwner?.unload();
    this.previewOwner = null;
    this.contentEl.empty();
  }

  private async initialize(): Promise<void> {
    try {
      this.sites = [...this.plugin.settings.sites];
      const site = this.pickSite();
      if (!site) {
        new Notice(t("notice.noSite"));
        this.close();
        return;
      }
      this.site = site;
      this.note = await this.notes.read(
        this.file,
        this.site,
        this.plugin.settings
      );
      const options = this.notes.buildOptions(
        this.note,
        this.site,
        this.plugin.settings
      );
      this.existingPostId = options.existingPostId;
      this.state = this.createState(options);
      await Promise.allSettled([
        this.loadCategories(),
        this.loadRemotePost()
      ]);
      this.render();
    } catch (error) {
      new Notice(t("notice.previewFailed", { error: errorMessage(error) }));
      this.close();
    }
  }

  private pickSite(): SiteProfile | undefined {
    const frontmatter = this.app.metadataCache.getFileCache(this.file)
      ?.frontmatter as Record<string, unknown> | undefined;
    const linkedUrl =
      typeof frontmatter?.[FRONTMATTER_KEYS.siteUrl] === "string"
        ? (frontmatter[FRONTMATTER_KEYS.siteUrl] as string)
        : undefined;
    return (
      (linkedUrl
        ? this.sites.find((site) => isSameSite(site.url, linkedUrl))
        : undefined) ??
      this.plugin.publisher.getActiveSite() ??
      this.sites[0]
    );
  }

  private createState(options: PublishOptions): PublishState {
    return {
      title: options.title,
      status: options.status,
      scheduledDate:
        options.status === "future"
          ? options.scheduledDate || defaultScheduleValue()
          : "",
      slug: options.slug,
      slugEdited: false,
      excerpt: options.excerpt,
      excerptEdited: false,
      categoryIds: new Set(options.categoryIds),
      tags: options.tags.join(", "),
      featuredImage: options.featuredImage ?? "",
      featuredMediaId: options.featuredMediaId,
      format: options.format,
      commentStatus: options.commentStatus,
      pingStatus: options.pingStatus,
      sticky: options.sticky,
      password: "",
      clearPassword: false,
      overwriteConflicts: false,
      tab: this.initialTab
    };
  }

  private async loadCategories(): Promise<void> {
    this.categoriesLoading = true;
    this.categoryError = "";
    try {
      const client = this.plugin.publisher.createClient(this.site);
      this.categories = await client.listCategories();
      this.categoriesLoaded = true;
    } catch (error) {
      this.categoryError = errorMessage(error);
      this.categoriesLoaded = true;
    } finally {
      this.categoriesLoading = false;
    }
  }

  private async loadRemotePost(): Promise<void> {
    this.remotePost = undefined;
    this.remoteMissing = false;
    this.remoteError = "";
    this.conflict = false;
    if (!this.existingPostId) {
      return;
    }

    try {
      const client = this.plugin.publisher.createClient(this.site);
      const post = await client.getPost(this.existingPostId);
      this.remotePost = post;

      if (!this.note.meta.status) {
        const status = post.status as PostStatus;
        if (POST_STATUSES.includes(status)) {
          this.state.status = status;
        }
      }
      if (!this.note.meta.format) {
        const format = post.format as PostFormat;
        if (POST_FORMATS.includes(format)) {
          this.state.format = format;
        }
      }
      if (!this.note.meta.categories?.length && post.categories.length > 0) {
        this.state.categoryIds = new Set(post.categories);
      }
      if (
        this.note.meta.featuredMedia === undefined &&
        post.featured_media > 0
      ) {
        this.state.featuredMediaId = post.featured_media;
      }
      this.state.commentStatus = post.comment_status ?? "open";
      this.state.pingStatus = post.ping_status ?? "open";
      this.state.sticky = Boolean(post.sticky);
      if (!this.note.slugExplicit && post.slug) {
        this.state.slug = post.slug;
      }
      if (!this.note.excerptExplicit) {
        this.state.excerpt = htmlToText(post.excerpt.rendered);
      }
      if (!this.note.meta.tags?.length && post.tags.length > 0) {
        try {
          const remoteTags = await client.getTagsByIds(post.tags);
          this.state.tags = parseTagList(
            [...parseTagList(this.state.tags), ...remoteTags.map((tag) => tag.name)].join(
              ","
            )
          ).join(", ");
        } catch {
          // Tag names are a best-effort enhancement; IDs still exist remotely.
        }
      }
      if (post.status === "future" && post.date) {
        const localDate = toDateTimeLocal(post.date);
        if (localDate) {
          this.state.scheduledDate = localDate;
        }
      }

      this.conflict =
        this.plugin.settings.detectRemoteChanges &&
        remoteChanged(
          post.modified,
          this.note.meta.remoteModified,
          this.note.meta.lastSync
        );
    } catch (error) {
      if (
        error instanceof Error &&
        "status" in error &&
        (error as { status?: number }).status === 404
      ) {
        this.existingPostId = undefined;
        this.remoteMissing = true;
      } else {
        this.remoteError = errorMessage(error);
      }
    }
  }

  private render(): void {
    if (!this.state || !this.site) {
      return;
    }
    this.contentEl.empty();
    this.setTitle(
      this.existingPostId ? t("publish.titleEdit") : t("publish.titleCreate")
    );
    if (this.state.tab !== "preview") {
      this.previewOwner?.unload();
      this.previewOwner = null;
    }

    this.renderHeader();
    this.renderTabs();

    if (this.state.tab === "preview") {
      this.renderPreview();
    } else {
      this.renderDetails();
    }

    this.renderFooter();
  }

  private renderHeader(): void {
    const summary = this.contentEl.createDiv({ cls: "wp-publish-summary" });
    summary.createSpan({ cls: "wp-publish-file", text: this.file.path });
    summary.createSpan({
      cls: "wp-publish-mode",
      text: this.existingPostId
        ? t("publish.existingPost", { id: this.existingPostId })
        : t("publish.newPost")
    });

    if (this.remotePost) {
      this.contentEl.createDiv({
        cls: "wp-muted wp-remote-info",
        text: t("publish.remoteInfo", {
          id: this.remotePost.id,
          date: formatDateTime(this.remotePost.modified, getLanguage())
        })
      });
    }

    if (this.remoteError) {
      this.contentEl.createDiv({
        cls: "wp-warning",
        text: t("notice.connectionFailed", { error: this.remoteError })
      });
    }

    if (
      this.note.meta.siteUrl &&
      !isSameSite(this.note.meta.siteUrl, this.site.url)
    ) {
      this.contentEl.createDiv({
        cls: "wp-info",
        text: t("publish.siteChanged", { site: this.note.meta.siteUrl })
      });
    }

    if (this.remoteMissing) {
      this.contentEl.createDiv({
        cls: "wp-info",
        text: t("notice.postMissing")
      });
    }

    if (this.conflict) {
      const warning = this.contentEl.createDiv({ cls: "wp-warning" });
      warning.createEl("p", {
        text: t("publish.conflict", {
          date: this.remotePost
            ? formatDateTime(this.remotePost.modified, getLanguage())
            : ""
        })
      });
      new Setting(warning)
        .setName(t("publish.conflictConfirm"))
        .addToggle((toggle) =>
          toggle
            .setValue(this.state.overwriteConflicts)
            .onChange((value) => {
              this.state.overwriteConflicts = value;
            })
        );
    }
  }

  private renderTabs(): void {
    const tabs = this.contentEl.createDiv({
      cls: "wp-tabs",
      attr: { role: "tablist" }
    });
    const details = tabs.createEl("button", {
      cls: "wp-tab",
      text: t("publish.tabDetails"),
      attr: { role: "tab" }
    });
    const preview = tabs.createEl("button", {
      cls: "wp-tab",
      text: t("publish.tabPreview"),
      attr: { role: "tab" }
    });
    details.toggleClass("is-active", this.state.tab === "details");
    preview.toggleClass("is-active", this.state.tab === "preview");
    details.setAttr("aria-selected", String(this.state.tab === "details"));
    preview.setAttr("aria-selected", String(this.state.tab === "preview"));

    details.addEventListener("click", () => {
      if (this.busy) {
        return;
      }
      this.state.tab = "details";
      this.render();
    });
    preview.addEventListener("click", () => {
      if (this.busy) {
        return;
      }
      this.state.tab = "preview";
      this.render();
    });
  }

  private renderDetails(): void {
    const container = this.contentEl.createDiv({ cls: "wp-form" });

    new Setting(container)
      .setName(t("publish.site"))
      .addDropdown((dropdown) => {
        for (const site of this.sites) {
          dropdown.addOption(site.id, site.name || site.url);
        }
        dropdown
          .setValue(this.site.id)
          .setDisabled(this.sites.length <= 1 || this.busy)
          .onChange((value) => void this.changeSite(value));
      });

    new Setting(container)
      .setName(`${t("publish.title")} *`)
      .addText((text) => {
        text
          .setPlaceholder(t("publish.titlePlaceholder"))
          .setValue(this.state.title)
          .onChange((value) => {
            this.state.title = value;
          });
        text.inputEl.addClass("wp-title-input");
      });

    new Setting(container)
      .setName(t("publish.status"))
      .addDropdown((dropdown) => {
        for (const status of POST_STATUSES) {
          dropdown.addOption(status, statusLabel(status));
        }
        dropdown.setValue(this.state.status).onChange((value) => {
          this.state.status = value as PostStatus;
          if (value === "future" && !this.state.scheduledDate) {
            this.state.scheduledDate = defaultScheduleValue();
          }
          this.render();
        });
      });

    if (this.state.status === "future") {
      new Setting(container)
        .setName(t("publish.schedule"))
        .setDesc(t("publish.scheduleHint"))
        .addText((text) => {
          text.inputEl.type = "datetime-local";
          text.setValue(this.state.scheduledDate).onChange((value) => {
            this.state.scheduledDate = value;
          });
        });
    }

    new Setting(container)
      .setName(t("publish.slug"))
      .addText((text) => {
        text
          .setPlaceholder(t("publish.slugPlaceholder"))
          .setValue(this.state.slug)
          .onChange((value) => {
            this.state.slug = value.trim();
            this.state.slugEdited = true;
          });
      })
      .addExtraButton((button) =>
        button
          .setIcon("refresh-cw")
          .setTooltip(t("publish.slug"))
          .onClick(() => {
            this.state.slug = makeSlug(this.state.title);
            this.state.slugEdited = true;
            this.render();
          })
      );

    new Setting(container)
      .setName(t("publish.excerpt"))
      .addTextArea((text) => {
        text
          .setPlaceholder(t("publish.excerptPlaceholder"))
          .setValue(this.state.excerpt)
          .onChange((value) => {
            this.state.excerpt = value;
            this.state.excerptEdited = true;
          });
        text.inputEl.rows = 3;
      });

    this.renderCategories(container);
    this.renderTags(container);
    this.renderFeaturedImage(container);
    this.renderAdvanced(container);
  }

  private renderCategories(container: HTMLElement): void {
    const section = container.createDiv({ cls: "wp-form-section" });
    const head = section.createDiv({ cls: "wp-section-head" });
    head.createEl("h3", { text: t("publish.categories") });
    const refresh = head.createEl("button", {
      cls: "wp-link-button",
      text: t("publish.categoriesRefresh")
    });
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      await this.loadCategories();
      refresh.disabled = false;
      this.renderCategoryList();
    });

    const search = section.createEl("input", {
      cls: "wp-category-search",
      attr: {
        type: "search",
        placeholder: t("publish.categorySearch")
      }
    });
    search.value = this.categoryQuery;
    search.addEventListener("input", () => {
      this.categoryQuery = search.value;
      this.renderCategoryList();
    });

    this.categoryListEl = section.createDiv({ cls: "wp-category-picker" });

    const createRow = section.createDiv({ cls: "wp-category-create" });
    const nameInput = createRow.createEl("input", {
      attr: {
        type: "text",
        placeholder: t("publish.newCategoryPlaceholder")
      }
    });
    const addButton = createRow.createEl("button", {
      text: t("common.add")
    });
    addButton.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) {
        return;
      }
      addButton.disabled = true;
      try {
        const client = this.plugin.publisher.createClient(this.site);
        const category = await client.createCategory(name);
        this.categories.push(category);
        this.categories.sort((left, right) =>
          left.name.localeCompare(right.name)
        );
        this.categoriesLoaded = true;
        this.categoryError = "";
        this.state.categoryIds.add(category.id);
        nameInput.value = "";
        this.renderCategoryList();
        new Notice(t("notice.categoryCreated", { name: category.name }));
      } catch (error) {
        new Notice(
          t("publish.categoryCreateFailed", {
            error: errorMessage(error)
          })
        );
      } finally {
        addButton.disabled = false;
      }
    });

    this.renderCategoryList();
  }

  private renderCategoryList(): void {
    if (!this.categoryListEl) {
      return;
    }
    this.categoryListEl.empty();

    if (this.categoriesLoading) {
      this.categoryListEl.createDiv({
        cls: "wp-muted",
        text: t("publish.loadingCategories")
      });
      return;
    }
    if (this.categoryError) {
      this.categoryListEl.createDiv({
        cls: "wp-warning",
        text: t("publish.categoriesLoadFailed", {
          error: this.categoryError
        })
      });
      return;
    }
    if (!this.categoriesLoaded || this.categories.length === 0) {
      this.categoryListEl.createDiv({
        cls: "wp-muted",
        text: t("publish.noCategories")
      });
      return;
    }

    const query = this.categoryQuery.trim().toLocaleLowerCase();
    const depths = categoryDepths(this.categories);
    const visible = this.categories.filter(
      (category) =>
        !query || category.name.toLocaleLowerCase().includes(query)
    );

    if (visible.length === 0) {
      this.categoryListEl.createDiv({
        cls: "wp-muted",
        text: t("image.noResults")
      });
      return;
    }

    for (const category of visible) {
      const label = this.categoryListEl.createEl("label", {
        cls: "wp-category-option"
      });
      const checkbox = label.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.state.categoryIds.has(category.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.state.categoryIds.add(category.id);
        } else {
          this.state.categoryIds.delete(category.id);
        }
      });
      label.createSpan({
        text: `${"— ".repeat(depths.get(category.id) ?? 0)}${category.name}`
      });
      label.createSpan({
        cls: "wp-category-count",
        text: String(category.count)
      });
    }
  }

  private renderTags(container: HTMLElement): void {
    new Setting(container)
      .setName(t("publish.tags"))
      .setDesc(t("publish.tagsHint"))
      .addText((text) =>
        text
          .setPlaceholder(t("publish.tagsPlaceholder"))
          .setValue(this.state.tags)
          .onChange((value) => {
            this.state.tags = value;
          })
      );
  }

  private renderFeaturedImage(container: HTMLElement): void {
    let inputEl: HTMLInputElement | null = null;
    const setting = new Setting(container)
      .setName(t("publish.featuredImage"))
      .addText((text) => {
        text
          .setPlaceholder(t("publish.featuredPlaceholder"))
          .setValue(this.state.featuredImage)
          .onChange((value) => {
            this.state.featuredImage = value;
            this.state.featuredMediaId = value.trim() ? undefined : 0;
            this.updateFeaturedHint(setting.settingEl);
          });
        inputEl = text.inputEl;
      })
      .addExtraButton((button) =>
        button
          .setIcon("image")
          .setTooltip(t("publish.chooseImage"))
          .onClick(() => {
            new ImageSuggestModal(this.app, (file) => {
              this.state.featuredImage = file.path;
              this.state.featuredMediaId = undefined;
              if (inputEl) {
                inputEl.value = file.path;
              }
              this.updateFeaturedHint(setting.settingEl);
            }).open();
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("image-plus")
          .setTooltip(t("publish.useFirstImage"))
          .onClick(() => {
            const source = firstImageSource(this.note.body);
            if (!source) {
              new Notice(t("publish.noImageFound"));
              return;
            }
            this.state.featuredImage = source;
            this.state.featuredMediaId = undefined;
            if (inputEl) {
              inputEl.value = source;
            }
            this.updateFeaturedHint(setting.settingEl);
          })
      )
      .addExtraButton((button) =>
        button
          .setIcon("x")
          .setTooltip(t("publish.clearImage"))
          .onClick(() => {
            this.state.featuredImage = "";
            this.state.featuredMediaId = 0;
            if (inputEl) {
              inputEl.value = "";
            }
            this.updateFeaturedHint(setting.settingEl);
          })
      );

    this.updateFeaturedHint(setting.settingEl);

    if (this.plugin.settings.autoFeaturedImage && !this.state.featuredImage) {
      container.createDiv({
        cls: "wp-muted wp-field-hint",
        text: t("publish.autoFeatured")
      });
    }
  }

  private updateFeaturedHint(settingEl: HTMLElement): void {
    settingEl.querySelector(".wp-featured-hint")?.remove();
    let hint = "";
    if (this.state.featuredImage) {
      hint = t("publish.imagePath", { path: this.state.featuredImage });
    } else if (this.state.featuredMediaId && this.state.featuredMediaId > 0) {
      hint = t("publish.featuredExisting", {
        id: this.state.featuredMediaId
      });
    }
    if (hint) {
      settingEl.createDiv({ cls: "wp-featured-hint wp-muted", text: hint });
    }
  }

  private renderAdvanced(container: HTMLElement): void {
    const details = container.createEl("details", { cls: "wp-advanced" });
    details.createEl("summary", { text: t("publish.advanced") });
    const body = details.createDiv({ cls: "wp-advanced-body" });

    new Setting(body)
      .setName(t("publish.format"))
      .addDropdown((dropdown) => {
        for (const format of POST_FORMATS) {
          dropdown.addOption(format, formatLabel(format));
        }
        dropdown.setValue(this.state.format).onChange((value) => {
          this.state.format = value as PostFormat;
        });
      });

    new Setting(body)
      .setName(t("publish.comments"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("open", t("comments.open"))
          .addOption("closed", t("comments.closed"))
          .setValue(this.state.commentStatus)
          .onChange((value) => {
            this.state.commentStatus = value as OpenStatus;
          });
      });

    new Setting(body)
      .setName(t("publish.pings"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("open", t("pings.open"))
          .addOption("closed", t("pings.closed"))
          .setValue(this.state.pingStatus)
          .onChange((value) => {
            this.state.pingStatus = value as OpenStatus;
          });
      });

    new Setting(body)
      .setName(t("publish.sticky"))
      .addToggle((toggle) =>
        toggle.setValue(this.state.sticky).onChange((value) => {
          this.state.sticky = value;
        })
      );

    new Setting(body)
      .setName(t("publish.password"))
      .setDesc(t("publish.passwordHint"))
      .addText((text) => {
        text
          .setPlaceholder(t("publish.passwordPlaceholder"))
          .setValue(this.state.password)
          .onChange((value) => {
            this.state.password = value;
          });
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "new-password";
      });

    if (this.existingPostId) {
      new Setting(body)
        .setName(t("publish.removePassword"))
        .addToggle((toggle) =>
          toggle.setValue(this.state.clearPassword).onChange((value) => {
            this.state.clearPassword = value;
          })
        );
    }
  }

  private renderPreview(): void {
    const preview = this.contentEl.createDiv({ cls: "wp-preview" });
    preview.createEl("h2", {
      text: this.state.title.trim() || this.file.basename
    });
    const meta = preview.createDiv({ cls: "wp-preview-meta" });
    meta.createSpan({
      text: `${this.site.name || this.site.url} · ${statusLabel(
        this.state.status
      )}`
    });
    if (this.state.excerpt.trim()) {
      preview.createEl("p", {
        cls: "wp-preview-excerpt",
        text: this.state.excerpt
      });
    }
    preview.createDiv({
      cls: "wp-muted wp-preview-hint",
      text: t("publish.previewHint")
    });
    const body = preview.createDiv({
      cls: "wp-preview-body markdown-rendered"
    });

    this.previewOwner?.unload();
    this.previewOwner = new Component();
    this.previewOwner.load();

    void this.plugin.publisher
      .renderPreview(
        this.file,
        this.site,
        this.buildOptions(),
        body,
        this.previewOwner
      )
      .catch((error) => {
        body.empty();
        body.createDiv({
          cls: "wp-warning",
          text: t("notice.previewFailed", {
            error: errorMessage(error)
          })
        });
      });
  }

  private renderFooter(): void {
    const footer = this.contentEl.createDiv({ cls: "wp-modal-footer" });
    this.statusEl = footer.createDiv({
      cls: "wp-status-line",
      text: this.statusMessage
    });

    const buttons = footer.createDiv({ cls: "wp-modal-actions" });
    this.cancelButton = buttons.createEl("button", {
      text: t("common.cancel")
    });
    this.cancelButton.addEventListener("click", () => {
      if (!this.busy) {
        this.close();
      }
    });

    this.submitButton = buttons.createEl("button", {
      text: this.existingPostId
        ? t("publish.submitUpdate")
        : t("publish.submitCreate"),
      cls: "mod-cta"
    });
    this.submitButton.addEventListener("click", () => void this.submit());
    this.updateBusyUi();
  }

  private async changeSite(siteId: string): Promise<void> {
    if (this.busy || siteId === this.site.id) {
      return;
    }
    const site = this.sites.find((candidate) => candidate.id === siteId);
    if (!site) {
      return;
    }

    const previous = this.state;
    const previousSite = this.site;
    this.site = site;
    try {
      this.note = await this.notes.read(
        this.file,
        site,
        this.plugin.settings
      );
      const options = this.notes.buildOptions(
        this.note,
        site,
        this.plugin.settings
      );
      this.existingPostId = options.existingPostId;
      this.state = {
        ...this.createState(options),
        title: previous.title,
        excerpt: previous.excerpt,
        excerptEdited: previous.excerptEdited,
        slug: previous.slug,
        slugEdited: previous.slugEdited,
        password: previous.password,
        tab: previous.tab
      };
      this.categoryQuery = "";
      this.remotePost = undefined;
      this.conflict = false;
      this.remoteMissing = false;
      await Promise.allSettled([
        this.loadCategories(),
        this.loadRemotePost()
      ]);
      this.render();
    } catch (error) {
      this.site = previousSite;
      new Notice(t("notice.previewFailed", { error: errorMessage(error) }));
      this.render();
    }
  }

  private buildOptions(): PublishOptions {
    return {
      siteId: this.site.id,
      title: this.state.title.trim(),
      content: this.note.body,
      excerpt: this.state.excerpt,
      slug: this.state.slug,
      status: this.state.status,
      scheduledDate:
        this.state.status === "future"
          ? this.state.scheduledDate
          : undefined,
      categoryIds: Array.from(this.state.categoryIds),
      tags: parseTagList(this.state.tags),
      featuredImage: this.state.featuredImage.trim() || undefined,
      featuredMediaId: this.state.featuredMediaId,
      format: this.state.format,
      commentStatus: this.state.commentStatus,
      pingStatus: this.state.pingStatus,
      sticky: this.state.sticky,
      password: this.state.password.trim() || undefined,
      clearPassword: this.state.clearPassword,
      existingPostId: this.existingPostId,
      preserveSlug: !this.note.slugExplicit && !this.state.slugEdited,
      preserveExcerpt:
        !this.note.excerptExplicit && !this.state.excerptEdited,
      overwriteRemoteChanges: this.state.overwriteConflicts
    };
  }

  private async submit(): Promise<void> {
    if (this.busy) {
      return;
    }
    if (!this.state.title.trim()) {
      new Notice(t("notice.titleRequired"));
      return;
    }
    if (this.state.status === "future") {
      if (!isValidSchedule(this.state.scheduledDate)) {
        new Notice(t("notice.scheduleRequired"));
        return;
      }
      if (!isFutureSchedule(this.state.scheduledDate)) {
        new Notice(t("notice.scheduleFuture"));
        return;
      }
    }
    if (this.conflict && !this.state.overwriteConflicts) {
      new Notice(t("notice.remoteConflict"));
      return;
    }

    this.busy = true;
    this.statusMessage = "";
    this.updateBusyUi();
    if (this.statusEl) {
      this.statusEl.setText(t("notice.publishing"));
      this.statusEl.removeClass("is-error", "is-success");
    }

    try {
      const result = await this.plugin.publisher.publish(
        this.file,
        this.site,
        this.buildOptions(),
        (message) => {
          this.statusEl?.setText(message);
        }
      );
      const message =
        result.action === "created"
          ? t("notice.publishCreated", { title: this.state.title })
          : t("notice.publishUpdated", { title: this.state.title });
      new Notice(message);
      if (result.warnings.length > 0) {
        new Notice(result.warnings.join("\n"), 10000);
      }
      if (
        this.plugin.settings.openPostAfterPublish &&
        isSafeExternalUrl(result.post.link)
      ) {
        window.open(result.post.link, "_blank");
      }
      this.plugin.updateStatusBar();
      this.close();
    } catch (error) {
      if (error instanceof RemoteConflictError) {
        this.remotePost = error.remote;
        this.conflict = true;
        this.state.overwriteConflicts = false;
        this.busy = false;
        this.render();
        new Notice(t("notice.remoteConflict"));
        return;
      }
      const message = t("notice.publishFailed", {
        error: errorMessage(error)
      });
      this.statusMessage = message;
      new Notice(message, 10000);
      this.busy = false;
      this.updateBusyUi();
      if (this.statusEl) {
        this.statusEl.setText(message);
        this.statusEl.addClass("is-error");
      }
    }
  }

  private updateBusyUi(): void {
    if (this.submitButton) {
      this.submitButton.disabled = this.busy;
      this.submitButton.setText(
        this.busy
          ? t("publish.busy")
          : this.existingPostId
            ? t("publish.submitUpdate")
            : t("publish.submitCreate")
      );
    }
    if (this.cancelButton) {
      this.cancelButton.disabled = this.busy;
    }
  }
}
