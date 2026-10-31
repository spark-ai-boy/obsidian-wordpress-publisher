import { App, Modal, Notice, Setting } from "obsidian";
import type WordPressPublisherPlugin from "../main";
import type { SiteProfile, WordPressCategory } from "../types";
import {
  POST_FORMATS,
  POST_STATUSES,
  createSiteProfile
} from "../constants";
import { createId } from "../utils/id";
import { t, formatLabel, statusLabel } from "../i18n";
import { parseTagList } from "../utils/markdown";
import { normalizeSiteUrl } from "../utils/url";
import { errorMessage } from "../utils/errors";
import { ConfirmModal } from "./confirm-modal";

export class SiteModal extends Modal {
  private readonly plugin: WordPressPublisherPlugin;
  private readonly existing: boolean;
  private readonly onSaved: () => void;
  private readonly draft: SiteProfile;
  private readonly savedPassword: string;
  private readonly selectedCategories: Set<number>;
  private categories: WordPressCategory[] = [];
  private categoriesLoaded = false;
  private categoryContainer: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private passwordInput: HTMLInputElement | null = null;
  private readonly inputs: Record<string, HTMLInputElement> = {};

  constructor(
    app: App,
    plugin: WordPressPublisherPlugin,
    site: SiteProfile | undefined,
    onSaved: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.existing = Boolean(site);
    this.onSaved = onSaved;
    const activeSite = plugin.publisher.getActiveSite();
    this.draft = site
      ? { ...site, defaultCategoryIds: [...site.defaultCategoryIds] }
      : createSiteProfile(createId(), {
          defaultStatus: activeSite?.defaultStatus ?? "draft",
          defaultFormat: activeSite?.defaultFormat ?? "standard"
        });
    this.savedPassword = site?.applicationPassword ?? "";
    this.selectedCategories = new Set(this.draft.defaultCategoryIds);
  }

  onOpen(): void {
    this.modalEl.addClass("wordpress-publisher-site-modal");
    this.setTitle(
      this.existing ? t("site.editTitle") : t("site.addTitle")
    );
    this.render();
    if (this.draft.url && this.draft.username && this.draft.applicationPassword) {
      void this.loadCategories(true);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();

    new Setting(this.contentEl)
      .setName(t("site.name"))
      .addText((text) => {
        text
          .setPlaceholder(t("site.namePlaceholder"))
          .setValue(this.draft.name)
          .onChange((value) => {
            this.draft.name = value.trim();
          });
        this.inputs.name = text.inputEl;
      });

    new Setting(this.contentEl)
      .setName(t("site.url"))
      .setDesc(t("site.urlHint"))
      .addText((text) => {
        text
          .setPlaceholder(t("site.urlPlaceholder"))
          .setValue(this.draft.url)
          .onChange((value) => {
            this.draft.url = value.trim();
          });
        text.inputEl.type = "url";
        this.inputs.url = text.inputEl;
      });

    new Setting(this.contentEl)
      .setName(t("site.username"))
      .setDesc(t("site.usernameHint"))
      .addText((text) => {
        text
          .setPlaceholder("admin")
          .setValue(this.draft.username)
          .onChange((value) => {
            this.draft.username = value.trim();
          });
        this.inputs.username = text.inputEl;
      });

    new Setting(this.contentEl)
      .setName(t("site.password"))
      .setDesc(
        this.existing ? t("site.passwordKeep") : t("site.passwordHint")
      )
      .addText((text) => {
        text
          .setPlaceholder(
            this.existing
              ? "•••• •••• •••• ••••"
              : t("site.passwordPlaceholder")
          )
          .onChange((value) => {
            this.draft.applicationPassword =
              value.trim() || this.savedPassword;
          });
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "new-password";
        this.passwordInput = text.inputEl;
      })
      .addExtraButton((button) => {
        let visible = false;
        button
          .setIcon("eye")
          .setTooltip(t("site.password"))
          .onClick(() => {
            visible = !visible;
            if (this.passwordInput) {
              this.passwordInput.type = visible ? "text" : "password";
            }
            button.setIcon(visible ? "eye-off" : "eye");
          });
      });

    this.contentEl.createDiv({
      cls: "wp-secret-note",
      text: t("site.secretNotice")
    });

    this.contentEl.createEl("h3", { text: t("site.defaults") });

    new Setting(this.contentEl)
      .setName(t("site.defaultStatus"))
      .addDropdown((dropdown) => {
        for (const status of POST_STATUSES) {
          dropdown.addOption(status, statusLabel(status));
        }
        dropdown
          .setValue(this.draft.defaultStatus)
          .onChange((value) => {
            this.draft.defaultStatus = value as SiteProfile["defaultStatus"];
          });
      });

    new Setting(this.contentEl)
      .setName(t("site.defaultFormat"))
      .addDropdown((dropdown) => {
        for (const format of POST_FORMATS) {
          dropdown.addOption(format, formatLabel(format));
        }
        dropdown
          .setValue(this.draft.defaultFormat)
          .onChange((value) => {
            this.draft.defaultFormat = value as SiteProfile["defaultFormat"];
          });
      });

    const categorySetting = new Setting(this.contentEl).setName(
      t("site.defaultCategories")
    );
    this.categoryContainer = this.contentEl.createDiv({
      cls: "wp-category-picker wp-site-categories"
    });
    categorySetting.settingEl.addClass("wp-setting-stacked");
    this.renderCategoryList();

    new Setting(this.contentEl)
      .setName(t("site.defaultTags"))
      .addText((text) =>
        text
          .setPlaceholder(t("site.defaultTagsPlaceholder"))
          .setValue(this.draft.defaultTags.join(", "))
          .onChange((value) => {
            this.draft.defaultTags = parseTagList(value);
          })
      );

    const status = this.contentEl.createDiv({ cls: "wp-status-line" });
    this.statusEl = status;

    const buttons = this.contentEl.createDiv({
      cls: "modal-button-container wp-site-actions"
    });

    if (this.existing) {
      const remove = buttons.createEl("button", {
        text: t("site.delete"),
        cls: "mod-warning"
      });
      remove.addEventListener("click", () => this.confirmDelete());
    }

    const test = buttons.createEl("button", { text: t("site.test") });
    test.addEventListener("click", () => void this.testConnection());

    const cancel = buttons.createEl("button", { text: t("common.cancel") });
    cancel.addEventListener("click", () => this.close());

    const save = buttons.createEl("button", {
      text: t("common.save"),
      cls: "mod-cta"
    });
    save.addEventListener("click", () => void this.save());
  }

  private renderCategoryList(): void {
    if (!this.categoryContainer) {
      return;
    }
    this.categoryContainer.empty();

    if (!this.categoriesLoaded) {
      this.categoryContainer.createDiv({
        cls: "wp-muted",
        text: t("site.noCategories")
      });
      return;
    }

    if (this.categories.length === 0) {
      this.categoryContainer.createDiv({
        cls: "wp-muted",
        text: t("publish.noCategories")
      });
      return;
    }

    if (!this.categories.some((category) => this.selectedCategories.has(category.id))) {
      const uncategorized = this.categories.find(
        (category) => category.slug === "uncategorized"
      );
      if (uncategorized) {
        this.selectedCategories.add(uncategorized.id);
      }
    }

    const byId = new Map(this.categories.map((category) => [category.id, category]));
    const depth = (category: WordPressCategory): number => {
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
      return level;
    };

    for (const category of this.categories) {
      const label = this.categoryContainer.createEl("label", {
        cls: "wp-category-option"
      });
      const checkbox = label.createEl("input");
      checkbox.type = "checkbox";
      checkbox.checked = this.selectedCategories.has(category.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedCategories.add(category.id);
        } else {
          this.selectedCategories.delete(category.id);
        }
      });
      label.createSpan({
        text: `${"— ".repeat(depth(category))}${category.name}`
      });
      label.createSpan({
        cls: "wp-category-count",
        text: String(category.count)
      });
    }
  }

  private async loadCategories(reload: boolean): Promise<void> {
    if (this.draft.url === "" || this.draft.username === "") {
      return;
    }
    if (!this.draft.applicationPassword) {
      return;
    }
    if (this.categoriesLoaded && !reload) {
      return;
    }
    this.setStatus(t("site.loadingCategories"));
    try {
      this.draft.url = normalizeSiteUrl(this.draft.url);
      const client = this.plugin.publisher.createClient(this.draft);
      this.categories = await client.listCategories();
      this.categoriesLoaded = true;
      this.renderCategoryList();
      this.setStatus("");
    } catch (error) {
      this.setStatus(t("site.categoryLoadFailed", { error: errorMessage(error) }));
    }
  }

  private async testConnection(): Promise<void> {
    if (!this.validate(false)) {
      return;
    }
    this.draft.url = normalizeSiteUrl(this.draft.url);
    if (this.statusEl) {
      this.statusEl.setText(t("site.testing"));
      this.statusEl.removeClass("is-error", "is-success");
    }
    try {
      const client = this.plugin.publisher.createClient(this.draft);
      const user = await client.testConnection();
      this.categories = await client.listCategories();
      this.categoriesLoaded = true;
      this.renderCategoryList();
      const message = t("site.testSuccess", {
        site: this.draft.name || this.draft.url,
        user: user.name
      });
      this.setStatus(message, "success");
      new Notice(message);
    } catch (error) {
      const message = t("site.testFailed", {
        error: errorMessage(error)
      });
      this.setStatus(message, "error");
      new Notice(message);
    }
  }

  private validate(requirePassword = true): boolean {
    this.draft.url = this.draft.url.trim();
    this.draft.username = this.draft.username.trim();
    this.draft.name = this.draft.name.trim();
    if (this.draft.name === "") {
      this.draft.name = this.draft.url;
    }
    if (!this.draft.url || !this.draft.username) {
      new Notice(t("site.required"));
      return false;
    }
    if (requirePassword && !this.draft.applicationPassword) {
      new Notice(t("site.required"));
      return false;
    }
    try {
      this.draft.url = normalizeSiteUrl(this.draft.url);
    } catch {
      new Notice(t("site.invalidUrl"));
      return false;
    }
    return true;
  }

  private async save(): Promise<void> {
    if (!this.validate(true)) {
      return;
    }
    if (this.categoriesLoaded) {
      this.draft.defaultCategoryIds = Array.from(this.selectedCategories);
    }
    const sites = this.plugin.settings.sites;
    const index = sites.findIndex((site) => site.id === this.draft.id);
    if (index >= 0) {
      sites[index] = { ...this.draft };
    } else {
      sites.push({ ...this.draft });
    }
    if (!this.plugin.settings.activeSiteId) {
      this.plugin.settings.activeSiteId = this.draft.id;
    }
    await this.plugin.saveSettings();
    new Notice(t("site.saved"));
    this.onSaved();
    this.close();
  }

  private confirmDelete(): void {
    new ConfirmModal(this.app, {
      title: t("site.deleteTitle"),
      message: t("site.deleteConfirm", {
        name: this.draft.name || this.draft.url
      }),
      confirmText: t("site.delete"),
      danger: true,
      onConfirm: async () => {
        const settings = this.plugin.settings;
        settings.sites = settings.sites.filter(
          (site) => site.id !== this.draft.id
        );
        if (settings.activeSiteId === this.draft.id) {
          settings.activeSiteId = settings.sites[0]?.id ?? "";
        }
        await this.plugin.saveSettings();
        new Notice(t("site.deleted"));
        this.onSaved();
        this.close();
      }
    }).open();
  }

  private setStatus(message: string, tone?: "success" | "error"): void {
    if (!this.statusEl) {
      return;
    }
    this.statusEl.setText(message);
    this.statusEl.removeClass("is-success", "is-error");
    if (tone) {
      this.statusEl.addClass(tone === "success" ? "is-success" : "is-error");
    }
  }
}
