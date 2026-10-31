import {
  App,
  Notice,
  PluginSettingTab,
  Setting
} from "obsidian";
import type WordPressPublisherPlugin from "../main";
import type { PublisherSettings, SiteProfile } from "../types";
import {
  DOCS_URL,
  POST_FORMATS,
  POST_STATUSES,
  REPO_URL
} from "../constants";
import { errorMessage } from "../utils/errors";
import { formatLabel, setLanguage, statusLabel, t } from "../i18n";
import { ConfirmModal } from "./confirm-modal";
import { SiteModal } from "./site-modal";

export class PublisherSettingTab extends PluginSettingTab {
  private readonly plugin: WordPressPublisherPlugin;

  constructor(app: App, plugin: WordPressPublisherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("wordpress-publisher-settings");

    new Setting(containerEl).setName(t("settings.general")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", t("settings.languageAuto"))
          .addOption("zh", t("settings.languageZh"))
          .addOption("en", t("settings.languageEn"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as PublisherSettings["language"];
            setLanguage(this.plugin.settings.language);
            await this.plugin.saveSettings();
            this.plugin.updateStatusBar();
            this.display();
            new Notice(t("settings.languageReload"));
          });
      });

    new Setting(containerEl).setName(t("settings.connection")).setHeading();
    this.renderSites(containerEl);

    new Setting(containerEl).setName(t("settings.defaults")).setHeading();
    const activeSite =
      this.plugin.settings.sites.find(
        (site) => site.id === this.plugin.settings.activeSiteId
      ) ?? this.plugin.settings.sites[0];

    new Setting(containerEl)
      .setName(t("settings.defaultStatus"))
      .setDesc(t("settings.defaultStatusDesc"))
      .addDropdown((dropdown) => {
        for (const status of POST_STATUSES) {
          dropdown.addOption(status, statusLabel(status));
        }
        dropdown
          .setValue(activeSite?.defaultStatus ?? "draft")
          .setDisabled(!activeSite)
          .onChange(async (value) => {
            if (!activeSite) {
              return;
            }
            activeSite.defaultStatus = value as SiteProfile["defaultStatus"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.defaultFormat"))
      .setDesc(t("settings.defaultFormatDesc"))
      .addDropdown((dropdown) => {
        for (const format of POST_FORMATS) {
          dropdown.addOption(format, formatLabel(format));
        }
        dropdown
          .setValue(activeSite?.defaultFormat ?? "standard")
          .setDisabled(!activeSite)
          .onChange(async (value) => {
            if (!activeSite) {
              return;
            }
            activeSite.defaultFormat = value as SiteProfile["defaultFormat"];
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.commentStatus"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("open", t("comments.open"))
          .addOption("closed", t("comments.closed"))
          .setValue(this.plugin.settings.defaultCommentStatus)
          .onChange(async (value) => {
            this.plugin.settings.defaultCommentStatus = value as "open" | "closed";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t("settings.pingStatus"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("open", t("pings.open"))
          .addOption("closed", t("pings.closed"))
          .setValue(this.plugin.settings.defaultPingStatus)
          .onChange(async (value) => {
            this.plugin.settings.defaultPingStatus = value as "open" | "closed";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName(t("settings.content")).setHeading();

    this.addToggle(
      containerEl,
      t("settings.useH1"),
      t("settings.useH1Desc"),
      "useFirstHeadingAsTitle"
    );
    this.addToggle(
      containerEl,
      t("settings.stripH1"),
      t("settings.stripH1Desc"),
      "stripMatchingHeading"
    );
    this.addToggle(
      containerEl,
      t("settings.useNoteTags"),
      t("settings.useNoteTagsDesc"),
      "useNoteTags"
    );
    this.addToggle(
      containerEl,
      t("settings.uploadImages"),
      t("settings.uploadImagesDesc"),
      "uploadContentImages"
    );
    this.addToggle(
      containerEl,
      t("settings.uploadRemote"),
      t("settings.uploadRemoteDesc"),
      "uploadRemoteImages"
    );
    this.addToggle(
      containerEl,
      t("settings.autoFeatured"),
      t("settings.autoFeaturedDesc"),
      "autoFeaturedImage"
    );

    new Setting(containerEl)
      .setName(t("settings.wikilinks"))
      .setDesc(t("settings.wikilinksDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("text", t("settings.wikilinksText"))
          .addOption("link", t("settings.wikilinksLink"))
          .setValue(this.plugin.settings.wikilinkMode)
          .onChange(async (value) => {
            this.plugin.settings.wikilinkMode = value as "text" | "link";
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl).setName(t("settings.workflow")).setHeading();

    this.addToggle(
      containerEl,
      t("settings.openAfter"),
      t("settings.openAfterDesc"),
      "openPostAfterPublish"
    );
    this.addToggle(
      containerEl,
      t("settings.statusBar"),
      t("settings.statusBarDesc"),
      "showStatusBar"
    );
    this.addToggle(
      containerEl,
      t("settings.detectChanges"),
      t("settings.detectChangesDesc"),
      "detectRemoteChanges"
    );

    new Setting(containerEl).setName(t("settings.about")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.version", { version: this.plugin.manifest.version }))
      .addButton((button) =>
        button
          .setButtonText(t("settings.docs"))
          .onClick(() => window.open(DOCS_URL, "_blank"))
      )
      .addButton((button) =>
        button
          .setButtonText(t("settings.github"))
          .onClick(() => window.open(REPO_URL, "_blank"))
      );

    new Setting(containerEl)
      .setName(t("settings.security"))
      .setDesc(t("settings.securityDesc"));

    containerEl.createDiv({
      cls: "wp-muted wp-settings-note",
      text: t("settings.storageNote")
    });
  }

  private renderSites(containerEl: HTMLElement): void {
    const settings = this.plugin.settings;

    if (settings.sites.length > 0) {
      new Setting(containerEl)
        .setName(t("settings.activeSite"))
        .setDesc(t("settings.activeSiteDesc"))
        .addDropdown((dropdown) => {
          for (const site of settings.sites) {
            dropdown.addOption(site.id, site.name || site.url);
          }
          dropdown
            .setValue(settings.activeSiteId || settings.sites[0]?.id || "")
            .onChange(async (value) => {
              settings.activeSiteId = value;
              await this.plugin.saveSettings();
              this.display();
            });
        });
    }

    const list = containerEl.createDiv({ cls: "wp-site-list" });
    if (settings.sites.length === 0) {
      list.createDiv({ cls: "wp-empty", text: t("settings.noSites") });
    }

    for (const site of settings.sites) {
      this.renderSiteCard(list, site, site.id === settings.activeSiteId);
    }

    const addSetting = new Setting(containerEl)
      .setName(t("settings.manageSites"))
      .setDesc(t("settings.manageSitesDesc"))
      .addButton((button) =>
        button
          .setButtonText(t("settings.addSite"))
          .setCta()
          .onClick(() => {
            new SiteModal(this.app, this.plugin, undefined, () =>
              this.display()
            ).open();
          })
      );

    addSetting.settingEl.addClass("wp-add-site");
  }

  private renderSiteCard(
    parent: HTMLElement,
    site: SiteProfile,
    active: boolean
  ): void {
    const card = parent.createDiv({ cls: "wp-site-card" });
    if (active) {
      card.addClass("is-active");
    }

    const header = card.createDiv({ cls: "wp-site-card-header" });
    const title = header.createDiv({ cls: "wp-site-card-title" });
    title.createSpan({ text: site.name || site.url });
    if (active) {
      title.createSpan({ cls: "wp-badge", text: t("settings.activeSite") });
    }

    card.createDiv({
      cls: "wp-site-card-meta",
      text: `${site.url} · ${site.username}`
    });

    const actions = card.createDiv({ cls: "wp-site-card-actions" });

    const test = actions.createEl("button", { text: t("common.test") });
    test.addEventListener("click", () => void this.testSite(site, test));

    const edit = actions.createEl("button", { text: t("common.edit") });
    edit.addEventListener("click", () => {
      new SiteModal(this.app, this.plugin, site, () => this.display()).open();
    });

    const remove = actions.createEl("button", {
      text: t("site.delete"),
      cls: "mod-warning"
    });
    remove.addEventListener("click", () => {
      new ConfirmModal(this.app, {
        title: t("site.deleteTitle"),
        message: t("site.deleteConfirm", {
          name: site.name || site.url
        }),
        confirmText: t("site.delete"),
        danger: true,
        onConfirm: async () => {
          this.plugin.settings.sites = this.plugin.settings.sites.filter(
            (candidate) => candidate.id !== site.id
          );
          if (this.plugin.settings.activeSiteId === site.id) {
            this.plugin.settings.activeSiteId =
              this.plugin.settings.sites[0]?.id ?? "";
          }
          await this.plugin.saveSettings();
          new Notice(t("site.deleted"));
          this.display();
        }
      }).open();
    });
  }

  private async testSite(
    site: SiteProfile,
    button: HTMLButtonElement
  ): Promise<void> {
    button.disabled = true;
    const notice = new Notice(t("site.testing"), 0);
    try {
      const user = await this.plugin.publisher.testSite(site);
      const message = t("site.testSuccess", {
        site: site.name || site.url,
        user: user.name
      });
      notice.setMessage(message);
      window.setTimeout(() => notice.hide(), 5000);
    } catch (error) {
      notice.setMessage(
        t("site.testFailed", { error: errorMessage(error) })
      );
      window.setTimeout(() => notice.hide(), 8000);
    } finally {
      button.disabled = false;
    }
  }

  private addToggle(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    key: keyof Pick<
      PublisherSettings,
      | "useFirstHeadingAsTitle"
      | "stripMatchingHeading"
      | "useNoteTags"
      | "uploadContentImages"
      | "uploadRemoteImages"
      | "autoFeaturedImage"
      | "openPostAfterPublish"
      | "showStatusBar"
      | "detectRemoteChanges"
    >
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings[key]).onChange(async (value) => {
          const settings = this.plugin.settings as unknown as Record<
            string,
            boolean
          >;
          settings[key] = value;
          await this.plugin.saveSettings();
          if (key === "showStatusBar") {
            this.plugin.updateStatusBar();
          }
        })
      );
  }
}
