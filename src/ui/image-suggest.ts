import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "../i18n";
import { isImagePath } from "../utils/path";

export class ImageSuggestModal extends FuzzySuggestModal<TFile> {
  private readonly onChoose: (file: TFile) => void;
  private readonly files: TFile[];

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.files = app.vault
      .getFiles()
      .filter((file) => isImagePath(file.path))
      .sort((left, right) => left.path.localeCompare(right.path));
    this.setPlaceholder(t("image.placeholder"));
    this.emptyStateText = t("image.noResults");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
