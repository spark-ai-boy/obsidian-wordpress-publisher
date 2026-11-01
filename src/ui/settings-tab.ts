import {
  App,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinition,
  type SettingDefinitionItem
} from "obsidian";
import type WordPressPublisherPlugin from "../main";
import type { SiteProfile } from "../types";
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

const TOGGLE_KEYS = [
  "useFirstHeadingAsTitle",
  "stripMatchingHeading",
  "useNoteTags",
  "uploadContentImages",
  "uploadRemoteImages",
  "autoFeaturedImage",
  "openPostAfterPublish",
  "showStatusBar",
  "detectRemoteChanges"
] as const;

type ToggleKey = (typeof TOGGLE_KEYS)[number];

function isToggleKey(key: string): key is ToggleKey {
  return (TOGGLE_KEYS as readonly string[]).includes(key);
}

export class PublisherSettingTab extends PluginSettingTab {
  private readonly plugin: WordPressPublisherPlugin;

  constructor(app: App, plugin: WordPressPublisherPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.containerEl.addClass("wordpress-publisher-settings");
    const activeSite = this.activeSite();
    const hasSites = this.plugin.settings.sites.length > 0;

    return [
      {
        type: "group",
        heading: t("settings.general"),
        items: [
          this.dropdownDefinition(
            t("settings.language"),
            t("settings.languageDesc"),
            "language",
            {
              auto: t("settings.languageAuto"),
              zh: t("settings.languageZh"),
              en: t("settings.languageEn")
            }
          )
        ]
      },
      {
        type: "group",
        heading: t("settings.connection"),
        items: [
          ...(hasSites
            ? [
                this.dropdownDefinition(
                  t("settings.activeSite"),
                  t("settings.activeSiteDesc"),
                  "activeSiteId",
                  this.siteOptions()
                )
              ]
            : []),
          {
            name: t("settings.manageSites"),
            desc: t("settings.manageSitesDesc"),
            render: (setting) => this.renderSites(setting)
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.defaults"),
        items: [
          this.dropdownDefinition(
            t("settings.defaultStatus"),
            t("settings.defaultStatusDesc"),
            "defaultStatus",
            Object.fromEntries(
              POST_STATUSES.map((status) => [status, statusLabel(status)])
            ),
            !activeSite
          ),
          this.dropdownDefinition(
            t("settings.defaultFormat"),
            t("settings.defaultFormatDesc"),
            "defaultFormat",
            Object.fromEntries(
              POST_FORMATS.map((format) => [format, formatLabel(format)])
            ),
            !activeSite
          ),
          this.dropdownDefinition(
            t("settings.commentStatus"),
            "",
            "commentStatus",
            {
              open: t("comments.open"),
              closed: t("comments.closed")
            }
          ),
          this.dropdownDefinition(
            t("settings.pingStatus"),
            "",
            "pingStatus",
            {
              open: t("pings.open"),
              closed: t("pings.closed")
            }
          )
        ]
      },
      {
        type: "group",
        heading: t("settings.content"),
        items: [
          this.toggleDefinition(
            t("settings.useH1"),
            t("settings.useH1Desc"),
            "useFirstHeadingAsTitle"
          ),
          this.toggleDefinition(
            t("settings.stripH1"),
            t("settings.stripH1Desc"),
            "stripMatchingHeading"
          ),
          this.toggleDefinition(
            t("settings.useNoteTags"),
            t("settings.useNoteTagsDesc"),
            "useNoteTags"
          ),
          this.toggleDefinition(
            t("settings.uploadImages"),
            t("settings.uploadImagesDesc"),
            "uploadContentImages"
          ),
          this.toggleDefinition(
            t("settings.uploadRemote"),
            t("settings.uploadRemoteDesc"),
            "uploadRemoteImages"
          ),
          this.toggleDefinition(
            t("settings.autoFeatured"),
            t("settings.autoFeaturedDesc"),
            "autoFeaturedImage"
          ),
          this.dropdownDefinition(
            t("settings.wikilinks"),
            t("settings.wikilinksDesc"),
            "wikilinkMode",
            {
              text: t("settings.wikilinksText"),
              link: t("settings.wikilinksLink")
            }
          )
        ]
      },
      {
        type: "group",
        heading: t("settings.workflow"),
        items: [
          this.toggleDefinition(
            t("settings.openAfter"),
            t("settings.openAfterDesc"),
            "openPostAfterPublish"
          ),
          this.toggleDefinition(
            t("settings.statusBar"),
            t("settings.statusBarDesc"),
            "showStatusBar"
          ),
          this.toggleDefinition(
            t("settings.detectChanges"),
            t("settings.detectChangesDesc"),
            "detectRemoteChanges"
          )
        ]
      },
      {
        type: "group",
        heading: t("settings.about"),
        items: [
          {
            name: t("settings.version", {
              version: this.plugin.manifest.version
            }),
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText(t("settings.docs"))
                  .onClick(() => window.open(DOCS_URL, "_blank"))
              );
              setting.addButton((button) =>
                button
                  .setButtonText(t("settings.github"))
                  .onClick(() => window.open(REPO_URL, "_blank"))
              );
            }
          },
          {
            name: t("settings.security"),
            desc: `${t("settings.securityDesc")}\n\n${t("settings.storageNote")}`
          }
        ]
      }
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "language") {
      return this.plugin.settings.language;
    }
    if (key === "activeSiteId") {
      return this.activeSite()?.id ?? "";
    }
    if (key === "defaultStatus") {
      return this.activeSite()?.defaultStatus ?? "draft";
    }
    if (key === "defaultFormat") {
      return this.activeSite()?.defaultFormat ?? "standard";
    }
    if (key === "commentStatus") {
      return this.plugin.settings.defaultCommentStatus;
    }
    if (key === "pingStatus") {
      return this.plugin.settings.defaultPingStatus;
    }
    if (key === "wikilinkMode") {
      return this.plugin.settings.wikilinkMode;
    }
    if (isToggleKey(key)) {
      return this.plugin.settings[key];
    }
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "language") {
      const language = value === "zh" || value === "en" ? value : "auto";
      this.plugin.settings.language = language;
      setLanguage(language);
      await this.plugin.saveSettings();
      this.plugin.updateStatusBar();
      this.update();
      new Notice(t("settings.languageReload"));
      return;
    }

    if (key === "activeSiteId") {
      const id = String(value);
      if (!this.plugin.settings.sites.some((site) => site.id === id)) {
        return;
      }
      this.plugin.settings.activeSiteId = id;
      await this.plugin.saveSettings();
      this.update();
      return;
    }

    if (key === "defaultStatus") {
      const site = this.activeSite();
      if (!site) {
        return;
      }
      site.defaultStatus = value as SiteProfile["defaultStatus"];
      await this.plugin.saveSettings();
      return;
    }

    if (key === "defaultFormat") {
      const site = this.activeSite();
      if (!site) {
        return;
      }
      site.defaultFormat = value as SiteProfile["defaultFormat"];
      await this.plugin.saveSettings();
      return;
    }

    if (key === "commentStatus") {
      this.plugin.settings.defaultCommentStatus =
        value === "closed" ? "closed" : "open";
      await this.plugin.saveSettings();
      return;
    }

    if (key === "pingStatus") {
      this.plugin.settings.defaultPingStatus =
        value === "closed" ? "closed" : "open";
      await this.plugin.saveSettings();
      return;
    }

    if (key === "wikilinkMode") {
      this.plugin.settings.wikilinkMode = value === "link" ? "link" : "text";
      await this.plugin.saveSettings();
      return;
    }

    if (isToggleKey(key)) {
      this.plugin.settings[key] = value === true;
      await this.plugin.saveSettings();
      if (key === "showStatusBar") {
        this.plugin.updateStatusBar();
      }
    }
  }

  private activeSite(): SiteProfile | undefined {
    return (
      this.plugin.settings.sites.find(
        (site) => site.id === this.plugin.settings.activeSiteId
      ) ?? this.plugin.settings.sites[0]
    );
  }

  private siteOptions(): Record<string, string> {
    return Object.fromEntries(
      this.plugin.settings.sites.map((site) => [
        site.id,
        site.name || site.url
      ])
    );
  }

  private dropdownDefinition(
    name: string,
    desc: string,
    key: string,
    options: Record<string, string>,
    disabled = false
  ): SettingDefinition {
    return {
      name,
      desc,
      control: {
        type: "dropdown",
        key,
        options,
        disabled
      }
    };
  }

  private toggleDefinition(
    name: string,
    desc: string,
    key: ToggleKey
  ): SettingDefinition {
    return {
      name,
      desc,
      control: {
        type: "toggle",
        key
      }
    };
  }

  private renderSites(setting: Setting): void {
    const list = setting.settingEl.createDiv({ cls: "wp-site-list" });

    if (this.plugin.settings.sites.length === 0) {
      list.createDiv({ cls: "wp-empty", text: t("settings.noSites") });
    }

    const activeId = this.activeSite()?.id;
    for (const site of this.plugin.settings.sites) {
      this.renderSiteCard(list, site, site.id === activeId);
    }

    setting.settingEl.addClass("wp-add-site", "wp-sites-row");
    setting.addButton((button) =>
      button
        .setButtonText(t("settings.addSite"))
        .setCta()
        .onClick(() => {
          new SiteModal(this.app, this.plugin, undefined, () =>
            this.update()
          ).open();
        })
    );
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
      new SiteModal(this.app, this.plugin, site, () => this.update()).open();
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
          this.update();
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
}
