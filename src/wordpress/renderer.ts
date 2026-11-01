import { Component, MarkdownRenderChild, MarkdownRenderer } from "obsidian";
import type { App } from "obsidian";

export interface RenderResult {
  html: string;
  removedLocalImages: number;
}

function textOf(element: Element): string {
  return (element.textContent ?? "").trim();
}

function cleanElement(root: HTMLElement): number {
  let removedImages = 0;

  root.querySelectorAll("script, style, iframe, object, embed").forEach((el) => {
    el.remove();
  });

  root.querySelectorAll("*").forEach((el) => {
    for (const attribute of Array.from(el.attributes)) {
      if (/^on/i.test(attribute.name)) {
        el.removeAttribute(attribute.name);
      }
    }
  });

  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (/^app:\/\//i.test(src)) {
      removedImages += 1;
      const alt = img.getAttribute("alt") ?? "";
      img.replaceWith(document.createTextNode(alt));
    }
  });

  root.querySelectorAll("a").forEach((anchor) => {
    const href = (anchor.getAttribute("href") ?? "").trim();
    if (
      /^app:\/\//i.test(href) ||
      /\.md(?:#.*)?$/i.test(href) ||
      /^(?:javascript|vbscript|data):/i.test(href)
    ) {
      const span = createEl("span");
      span.textContent = textOf(anchor) || href;
      anchor.replaceWith(span);
    }
  });

  return removedImages;
}

/** Render Obsidian Markdown (including its extensions) into portable HTML. */
export class RenderService {
  private readonly app: App;

  constructor(app: App) {
    this.app = app;
  }

  async renderToHtml(markdown: string, sourcePath: string): Promise<RenderResult> {
    const container = createEl("div");
    const owner = new Component();
    const child = new MarkdownRenderChild(container);
    owner.addChild(child);
    owner.load();

    try {
      await MarkdownRenderer.render(
        this.app,
        markdown,
        container,
        sourcePath,
        child
      );
      const removedLocalImages = cleanElement(container);
      return { html: container.innerHTML, removedLocalImages };
    } finally {
      owner.unload();
    }
  }

  /** Render into a live element (used by the preview tab). */
  async renderInto(
    markdown: string,
    sourcePath: string,
    container: HTMLElement,
    owner: Component
  ): Promise<void> {
    const child = new MarkdownRenderChild(container);
    owner.addChild(child);
    container.empty();
    await MarkdownRenderer.render(
      this.app,
      markdown,
      container,
      sourcePath,
      child
    );
  }
}
