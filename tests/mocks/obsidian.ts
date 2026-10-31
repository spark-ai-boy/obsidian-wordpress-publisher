/**
 * Minimal runtime stub for Obsidian. Tests inject their own HTTP transport, so
 * this only needs to satisfy module imports.
 */
export function requestUrl(): Promise<never> {
  return Promise.reject(new Error("requestUrl is not mocked"));
}

export class TFile {
  path = "";
  name = "";
  basename = "";
  extension = "md";
}

export class Component {
  load(): void {
    // no-op
  }

  unload(): void {
    // no-op
  }
}

export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) {
    super();
  }
}

export class MarkdownRenderer {
  static async render(): Promise<void> {
    // no-op
  }
}

export class Modal {}
export class Notice {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class App {}
