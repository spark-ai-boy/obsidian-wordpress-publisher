import { Notice, Plugin, TFile } from "obsidian";
import {
  DEFAULT_SETTINGS,
  FRONTMATTER_KEYS,
  POST_FORMATS,
  POST_STATUSES
} from "./constants";
import type {
  MediaCacheEntry,
  PluginData,
  PublishHistoryEntry,
  PostStatus,
  PublisherSettings,
  SiteProfile
} from "./types";
import { createSiteProfile } from "./constants";
import { createId } from "./utils/id";
import { errorMessage, RemoteConflictError } from "./utils/errors";
import { isSafeExternalUrl, isSameSite } from "./utils/url";
import { PublisherService, type PublisherHost } from "./wordpress/publisher";
import { setLanguage, statusLabel, t } from "./i18n";
import { PublisherSettingTab } from "./ui/settings-tab";
import { PublishModal } from "./ui/publish-modal";
import { HistoryModal } from "./ui/history-modal";

function isPostStatus(value: unknown): value is PostStatus {
  return (
    typeof value === "string" &&
    POST_STATUSES.some((status) => status === value)
  );
}

function isHistoryEntry(value: unknown): value is PublishHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<PublishHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.notePath === "string" &&
    typeof entry.noteTitle === "string" &&
    typeof entry.postId === "number" &&
    typeof entry.postUrl === "string" &&
    typeof entry.siteId === "string" &&
    typeof entry.siteName === "string" &&
    typeof entry.siteUrl === "string" &&
    typeof entry.status === "string" &&
    (entry.action === "created" || entry.action === "updated") &&
    typeof entry.timestamp === "string"
  );
}

function isCacheEntry(value: unknown): value is MediaCacheEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<MediaCacheEntry>;
  return (
    typeof entry.id === "number" &&
    typeof entry.url === "string" &&
    typeof entry.mtime === "number" &&
    typeof entry.size === "number"
  );
}

export default class WordPressPublisherPlugin
  extends Plugin
  implements PublisherHost
{
  settings!: PublisherSettings;
  data!: PluginData;
  publisher!: PublisherService;
  private statusBarEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadPluginSettings();
    setLanguage(this.settings.language);
    this.publisher = new PublisherService(this);

    this.addSettingTab(new PublisherSettingTab(this.app, this));

    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("wordpress-publisher-status");
    this.registerDomEvent(this.statusBarEl, "click", () => {
      void this.openPublishModal();
    });

    this.addRibbonIcon("upload-cloud", t("ribbon.publish"), () => {
      void this.openPublishModal();
    });

    this.registerCommands();
    this.registerEvents();
    this.updateStatusBar();

    this.app.workspace.onLayoutReady(() => {
      this.updateStatusBar();
    });
  }

  onunload(): void {
    this.statusBarEl?.remove();
    this.statusBarEl = null;
  }

  getSettings(): PublisherSettings {
    return this.settings;
  }

  getData(): PluginData {
    return this.data;
  }

  async persistData(): Promise<void> {
    await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    this.data.settings = this.settings;
    await super.saveData(this.data);
  }

  getActiveMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file instanceof TFile && file.extension === "md" ? file : null;
  }

  async openPublishModal(file?: TFile): Promise<void> {
    const target = file ?? this.getActiveMarkdownFile();
    if (!target) {
      new Notice(t("notice.noActiveFile"));
      return;
    }
    if (this.settings.sites.length === 0) {
      new Notice(t("notice.noSite"));
      this.openSettings();
      return;
    }
    new PublishModal(this.app, this, target).open();
  }

  async openPreviewModal(file?: TFile): Promise<void> {
    const target = file ?? this.getActiveMarkdownFile();
    if (!target) {
      new Notice(t("notice.noActiveFile"));
      return;
    }
    if (this.settings.sites.length === 0) {
      new Notice(t("notice.noSite"));
      this.openSettings();
      return;
    }
    new PublishModal(this.app, this, target, "preview").open();
  }

  openSettings(): void {
    const setting = (
      this.app as unknown as {
        setting?: { open(): void; openTabById(id: string): void };
      }
    ).setting;
    setting?.open();
    setting?.openTabById(this.manifest.id);
  }

  updateStatusBar(): void {
    if (!this.statusBarEl) {
      return;
    }
    if (!this.settings.showStatusBar) {
      this.statusBarEl.hide();
      return;
    }

    const file = this.getActiveMarkdownFile();
    if (!file) {
      this.statusBarEl.hide();
      return;
    }

    this.statusBarEl.show();
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const rawStatus: unknown = frontmatter?.[FRONTMATTER_KEYS.status];
    const status = isPostStatus(rawStatus) ? rawStatus : null;
    const label = status ? statusLabel(status) : t("status.notPublished");
    this.statusBarEl.setText(`WordPress: ${label}`);
    this.statusBarEl.setAttr("aria-label", t("statusBar.tooltip"));
    this.statusBarEl.setAttr("title", t("statusBar.tooltip"));

    this.statusBarEl.removeClass(
      "wp-status-publish",
      "wp-status-draft",
      "wp-status-pending",
      "wp-status-private",
      "wp-status-future",
      "wp-status-none"
    );
    this.statusBarEl.addClass(`wp-status-${status ?? "none"}`);
  }

  private registerCommands(): void {
    this.addCommand({
      id: "publish-current-note",
      name: t("command.publish"),
      checkCallback: (checking) => {
        const file = this.getActiveMarkdownFile();
        if (!file) {
          return false;
        }
        if (!checking) {
          void this.openPublishModal(file);
        }
        return true;
      }
    });

    this.addCommand({
      id: "quick-publish-current-note",
      name: t("command.quickPublish"),
      checkCallback: (checking) => {
        const file = this.getActiveMarkdownFile();
        if (!file) {
          return false;
        }
        if (!checking) {
          void this.quickPublish(file);
        }
        return true;
      }
    });

    this.addCommand({
      id: "preview-current-note",
      name: t("command.preview"),
      checkCallback: (checking) => {
        const file = this.getActiveMarkdownFile();
        if (!file) {
          return false;
        }
        if (!checking) {
          void this.openPreviewModal(file);
        }
        return true;
      }
    });

    this.addCommand({
      id: "test-connection",
      name: t("command.testConnection"),
      callback: () => void this.testConnection()
    });

    this.addCommand({
      id: "show-publish-history",
      name: t("command.history"),
      callback: () => {
        new HistoryModal(this.app, this).open();
      }
    });

    this.addCommand({
      id: "open-last-post",
      name: t("command.openLast"),
      callback: () => this.openLastPost()
    });

    this.addCommand({
      id: "manage-sites",
      name: t("command.manageSites"),
      callback: () => this.openSettings()
    });
  }

  private registerEvents(): void {
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.updateStatusBar())
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () =>
        this.updateStatusBar()
      )
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (this.app.workspace.getActiveFile()?.path === file.path) {
          this.updateStatusBar();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) =>
            item
              .setTitle(t("menu.publish"))
              .setIcon("upload-cloud")
              .onClick(() => void this.openPublishModal(file))
          );
        }
      })
    );
  }

  private linkedSiteUrl(file: TFile): string | undefined {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const value: unknown = frontmatter?.[FRONTMATTER_KEYS.siteUrl];
    return typeof value === "string" ? value : undefined;
  }

  private siteForFile(file: TFile): SiteProfile | undefined {
    const linkedUrl = this.linkedSiteUrl(file);
    return (
      (linkedUrl
        ? this.settings.sites.find((site) => isSameSite(site.url, linkedUrl))
        : undefined) ?? this.publisher.getActiveSite()
    );
  }

  private async quickPublish(file: TFile): Promise<void> {
    const linkedUrl = this.linkedSiteUrl(file);
    if (
      linkedUrl &&
      !this.settings.sites.some((site) => isSameSite(site.url, linkedUrl))
    ) {
      new Notice(t("notice.siteMissing"));
      this.openSettings();
      return;
    }
    const site = this.siteForFile(file);
    if (!site) {
      new Notice(t("notice.noSite"));
      this.openSettings();
      return;
    }

    const notice = new Notice(t("notice.publishing"), 0);
    try {
      const result = await this.publisher.quickPublish(
        file,
        site,
        (message) => notice.setMessage(message)
      );
      const message =
        result.action === "created"
          ? t("notice.publishCreated", { title: file.basename })
          : t("notice.publishUpdated", { title: file.basename });
      notice.setMessage(
        result.warnings.length
          ? `${message}\n${result.warnings.join("\n")}`
          : message
      );
      window.setTimeout(() => notice.hide(), result.warnings.length ? 10000 : 5000);
      if (
        this.settings.openPostAfterPublish &&
        isSafeExternalUrl(result.post.link)
      ) {
        window.open(result.post.link, "_blank");
      }
      this.updateStatusBar();
    } catch (error) {
      notice.setMessage(
        error instanceof RemoteConflictError
          ? t("notice.remoteConflict")
          : t("notice.publishFailed", { error: errorMessage(error) })
      );
      window.setTimeout(() => notice.hide(), 10000);
    }
  }

  private async testConnection(): Promise<void> {
    const site = this.publisher.getActiveSite();
    if (!site) {
      new Notice(t("notice.noSite"));
      this.openSettings();
      return;
    }
    const notice = new Notice(t("site.testing"), 0);
    try {
      const user = await this.publisher.testSite(site);
      notice.setMessage(
        t("notice.connectionOk", {
          site: site.name || site.url,
          user: user.name
        })
      );
      window.setTimeout(() => notice.hide(), 5000);
    } catch (error) {
      notice.setMessage(
        t("notice.connectionFailed", { error: errorMessage(error) })
      );
      window.setTimeout(() => notice.hide(), 10000);
    }
  }

  private openLastPost(): void {
    const entry = this.data.history[0];
    if (!entry) {
      new Notice(t("notice.noLastPost"));
      return;
    }
    if (!isSafeExternalUrl(entry.postUrl)) {
      new Notice(t("connection.invalidUrl"));
      return;
    }
    window.open(entry.postUrl, "_blank");
  }

  private async loadPluginSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<PluginData> | null;
    const rawSettings = (stored?.settings ?? {}) as Partial<PublisherSettings>;
    const settings: PublisherSettings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings
    };

    settings.sites = Array.isArray(rawSettings.sites)
      ? rawSettings.sites
          .map((site) => this.normalizeSite(site))
          .filter((site): site is SiteProfile => site !== null)
      : [];

    if (!settings.sites.some((site) => site.id === settings.activeSiteId)) {
      settings.activeSiteId = settings.sites[0]?.id ?? "";
    }
    if (
      settings.language !== "auto" &&
      settings.language !== "zh" &&
      settings.language !== "en"
    ) {
      settings.language = "auto";
    }

    const history = Array.isArray(stored?.history)
      ? stored.history.filter(isHistoryEntry).slice(0, 100)
      : [];
    const mediaCache: Record<string, MediaCacheEntry> = {};
    if (stored?.mediaCache && typeof stored.mediaCache === "object") {
      for (const [key, entry] of Object.entries(stored.mediaCache)) {
        if (isCacheEntry(entry)) {
          mediaCache[key] = entry;
        }
      }
    }

    this.settings = settings;
    this.data = {
      settings,
      history,
      mediaCache
    };
  }

  private normalizeSite(raw: unknown): SiteProfile | null {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const value = raw as Partial<SiteProfile>;
    const id =
      typeof value.id === "string" && value.id ? value.id : createId();
    const status = POST_STATUSES.includes(value.defaultStatus as never)
      ? (value.defaultStatus as SiteProfile["defaultStatus"])
      : "draft";
    const format = POST_FORMATS.includes(value.defaultFormat as never)
      ? (value.defaultFormat as SiteProfile["defaultFormat"])
      : "standard";

    return createSiteProfile(id, {
      name: typeof value.name === "string" ? value.name : "",
      url: typeof value.url === "string" ? value.url : "",
      username: typeof value.username === "string" ? value.username : "",
      applicationPassword:
        typeof value.applicationPassword === "string"
          ? value.applicationPassword
          : "",
      defaultStatus: status,
      defaultFormat: format,
      defaultCategoryIds: Array.isArray(value.defaultCategoryIds)
        ? value.defaultCategoryIds.filter(
            (categoryId): categoryId is number =>
              typeof categoryId === "number" && Number.isInteger(categoryId)
          )
        : [],
      defaultTags: Array.isArray(value.defaultTags)
        ? value.defaultTags.filter(
            (tag): tag is string => typeof tag === "string"
          )
        : []
    });
  }
}
