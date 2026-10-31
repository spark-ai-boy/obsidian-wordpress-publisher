import { App, Modal } from "obsidian";
import { t } from "../i18n";

export interface ConfirmModalOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

export class ConfirmModal extends Modal {
  private readonly options: ConfirmModalOptions;

  constructor(app: App, options: ConfirmModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    this.setTitle(this.options.title);
    this.contentEl.addClass("wordpress-publisher-confirm");
    this.contentEl.createEl("p", { text: this.options.message });

    const buttons = this.contentEl.createDiv({
      cls: "modal-button-container"
    });
    const cancel = buttons.createEl("button", {
      text: this.options.cancelText ?? t("common.cancel")
    });
    cancel.addEventListener("click", () => this.close());

    const confirm = buttons.createEl("button", {
      text: this.options.confirmText ?? t("common.delete"),
      cls: this.options.danger ? "mod-warning" : "mod-cta"
    });
    confirm.addEventListener("click", () => {
      this.close();
      void this.options.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
