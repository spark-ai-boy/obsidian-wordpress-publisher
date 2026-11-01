import type { App, TFile } from "obsidian";
import { FRONTMATTER_KEYS } from "../constants";
import type { WikilinkMode } from "../types";
import { slugify } from "../utils/path";
import { maskProtectedContent } from "../utils/markdown";

function publishedUrl(app: App, file: TFile): string | undefined {
  const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
  const value: unknown = frontmatter?.[FRONTMATTER_KEYS.postUrl];
  return typeof value === "string" && /^https?:\/\//i.test(value)
    ? value
    : undefined;
}

function headingAnchor(heading: string): string {
  const text = heading.trim();
  const ascii = slugify(text);
  return encodeURIComponent(ascii || text.replace(/\s+/g, "-"));
}

function displayForLink(
  file: TFile,
  target: string,
  heading: string,
  alias: string
): string {
  if (alias) {
    return alias;
  }
  if (heading) {
    return `${file.basename} › ${heading}`;
  }
  return target || file.basename;
}

/**
 * Convert [[wiki links]] and Markdown links to vault notes into either plain
 * text or links to previously published WordPress posts.
 */
export function transformWikiLinks(
  markdown: string,
  app: App,
  sourcePath: string,
  mode: WikilinkMode
): string {
  const masked = maskProtectedContent(markdown);

  let output = masked.text.replace(
    /(!?)\[\[([^\]\n]+)\]\]/g,
    (_match, embed: string, inner: string) => {
      const pipe = inner.indexOf("|");
      const rawTarget = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
      const alias = (pipe >= 0 ? inner.slice(pipe + 1) : "").trim();
      const [targetPart, ...headingParts] = rawTarget.split("#");
      const target = (targetPart ?? "").trim();
      const heading = headingParts.join("#").trim();
      const file = target
        ? app.metadataCache.getFirstLinkpathDest(target, sourcePath)
        : null;

      if (
        embed &&
        (!file ||
          !/^(png|jpe?g|gif|webp|avif|svg)$/i.test(file.extension))
      ) {
        // Non-image embeds cannot be rendered in WordPress; keep readable text.
        return file
          ? displayForLink(file, target, heading, alias)
          : alias || target;
      }

      if (!file) {
        return alias || target || inner;
      }

      const display = displayForLink(file, target, heading, alias);
      if (mode === "text") {
        return display;
      }

      const url = publishedUrl(app, file);
      if (!url) {
        return display;
      }

      const fragment = heading ? `#${headingAnchor(heading)}` : "";
      return `[${display}](${url}${fragment})`;
    }
  );

  output = output.replace(
    /(^|[^!])\[([^\]\n]*)\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/g,
    (match, prefix: string, text: string, destination: string) => {
      if (!/\.(?:md|markdown)(?:#.*)?$/i.test(destination)) {
        return match;
      }
      const [pathPart, ...fragments] = destination.split("#");
      const target = pathPart ?? "";
      const file = app.metadataCache.getFirstLinkpathDest(target, sourcePath);
      if (!file) {
        return match;
      }
      const display = text || file.basename;
      if (mode === "text") {
        return `${prefix}${display}`;
      }
      const url = publishedUrl(app, file);
      if (!url) {
        return `${prefix}${display}`;
      }
      const heading = fragments.join("#");
      const fragment = heading ? `#${headingAnchor(heading)}` : "";
      return `${prefix}[${display}](${url}${fragment})`;
    }
  );

  return masked.restore(output);
}
