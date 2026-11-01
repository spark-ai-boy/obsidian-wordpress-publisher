import { App, Modal, Notice, TFile } from "obsidian";
import type WordPressPublisherPlugin from "../main";
import type { PublishHistoryEntry } from "../types";
import { t, getLanguage, statusLabel } from "../i18n";
import { formatDateTime } from "../utils/date";
import { isSafeExternalUrl } from "../utils/url";
import { ConfirmModal } from "./confirm-modal";

export class HistoryModal extends Modal {
  private readonly plugin: WordPressPublisherPlugin;

  constructor(app: App, plugin: WordPressPublisherPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.modalEl.addClass("wordpress-publisher-history-modal");
    this.setTitle(t("history.title"));
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    this.contentEl.empty();
    const entries = this.plugin.data.history;

    if (entries.length === 0) {
      this.contentEl.createDiv({
        cls: "wp-empty",
        text: t("history.empty")
      });
      return;
    }

    const toolbar = this.contentEl.createDiv({ cls: "wp-history-toolbar" });
    toolbar.createSpan({
      cls: "wp-muted",
      text: t("history.count", { count: entries.length })
    });
    const clear = toolbar.createEl("button", {
      text: t("history.clear"),
      cls: "mod-warning"
    });
    clear.addEventListener("click", () => {
      new ConfirmModal(this.app, {
        title: t("history.clearTitle"),
        message: t("history.clearConfirm"),
        confirmText: t("history.clear"),
        danger: true,
        onConfirm: async () => {
          this.plugin.data.history = [];
          await this.plugin.saveSettings();
          new Notice(t("notice.historyCleared"));
          this.render();
        }
      }).open();
    });

    const list = this.contentEl.createDiv({ cls: "wp-history-list" });
    for (const entry of entries) {
      this.renderEntry(list, entry);
    }
  }

  private renderEntry(parent: HTMLElement, entry: PublishHistoryEntry): void {
    const card = parent.createDiv({ cls: "wp-history-card" });
    const header = card.createDiv({ cls: "wp-history-header" });
    const title = header.createDiv({ cls: "wp-history-title" });
    title.createSpan({ text: entry.noteTitle });
    title.createSpan({
      cls: `wp-badge wp-badge-${entry.action}`,
      text:
        entry.action === "created"
          ? t("history.created")
          : t("history.updated")
    });
    title.createSpan({
      cls: "wp-badge",
      text: statusLabel(entry.status)
    });

    card.createDiv({
      cls: "wp-history-meta",
      text: `${t("history.entryMeta", {
        site: entry.siteName,
        date: formatDateTime(entry.timestamp, getLanguage())
      })} · #${entry.postId}`
    });
    card.createDiv({ cls: "wp-history-path", text: entry.notePath });

    const actions = card.createDiv({ cls: "wp-history-actions" });

    const openPost = actions.createEl("button", {
      text: t("history.openPost")
    });
    openPost.addEventListener("click", () => {
      if (isSafeExternalUrl(entry.postUrl)) {
        window.open(entry.postUrl, "_blank");
      } else {
        new Notice(t("connection.invalidUrl"));
      }
    });

    const openNote = actions.createEl("button", {
      text: t("history.openNote")
    });
    openNote.addEventListener("click", () => {
      const file = this.app.vault.getAbstractFileByPath(entry.notePath);
      if (file instanceof TFile) {
        this.close();
        void this.app.workspace.getLeaf(false).openFile(file);
      } else {
        new Notice(
          t("history.missingNote", { path: entry.notePath }),
          6000
        );
      }
    });

    const remove = actions.createEl("button", {
      text: t("common.delete"),
      cls: "mod-warning"
    });
    remove.addEventListener("click", () => {
      void (async () => {
        this.plugin.data.history = this.plugin.data.history.filter(
          (candidate) => candidate.id !== entry.id
        );
        await this.plugin.saveSettings();
        this.render();
      })();
    });
  }
}
