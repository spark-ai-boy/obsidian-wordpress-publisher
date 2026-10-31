import { isImagePath } from "./path";
import { isHttpUrl } from "./url";
import { maskProtectedContent } from "./markdown";

function parseDestination(raw: string): string {
  const value = raw.trim();
  if (value.startsWith("<")) {
    const close = value.indexOf(">");
    if (close > 0) {
      return value.slice(1, close).trim();
    }
  }
  return (value.match(/^(\S+)/)?.[1] ?? value).trim();
}

/**
 * Return the first image reference in a note, for the "use first image"
 * action in the publish dialog. Non-image note embeds are skipped.
 */
export function firstImageSource(markdown: string): string | undefined {
  const masked = maskProtectedContent(markdown);
  const pattern =
    /!\[\[([^\]\n]+)\]\]|!\[([^\]\n]*)\]\(\s*(<[^>\n]+>|[^)\n]+?)\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(masked.text)) !== null) {
    if (match[1] !== undefined) {
      const target =
        (match[1].split("|", 1)[0] ?? "").split("#", 1)[0] ?? "";
      const clean = target.trim();
      if (clean && (isHttpUrl(clean) || isImagePath(clean))) {
        return clean;
      }
      continue;
    }
    if (match[3] !== undefined) {
      const destination = parseDestination(match[3]);
      if (destination && (isHttpUrl(destination) || isImagePath(destination))) {
        return destination;
      }
    }
  }
  return undefined;
}
