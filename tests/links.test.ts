import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { transformWikiLinks } from "../src/wordpress/links";

const published = {
  path: "Published.md",
  basename: "Published"
} as TFile;
const unpublished = {
  path: "Draft.md",
  basename: "Draft"
} as TFile;

const frontmatter: Record<string, { frontmatter: Record<string, unknown> }> = {
  "Published.md": {
    frontmatter: { wordpress_url: "https://example.com/published" }
  },
  "Draft.md": { frontmatter: {} }
};

const app = {
  metadataCache: {
    getFirstLinkpathDest: (target: string) => {
      if (target === "Published" || target === "Published.md") {
        return published;
      }
      if (target === "Draft" || target === "Draft.md") {
        return unpublished;
      }
      return null;
    },
    getFileCache: (file: TFile) => frontmatter[file.path]
  }
} as unknown as App;

describe("transformWikiLinks", () => {
  it("keeps display text in text mode", () => {
    expect(
      transformWikiLinks("See [[Published|the post]].", app, "Note.md", "text")
    ).toBe("See the post.");
  });

  it("links to published posts in link mode", () => {
    expect(
      transformWikiLinks(
        "See [[Published|the post]] and [[Draft]].",
        app,
        "Note.md",
        "link"
      )
    ).toBe(
      "See [the post](https://example.com/published) and Draft."
    );
  });

  it("creates heading anchors", () => {
    expect(
      transformWikiLinks("[[Published#My Heading]]", app, "Note.md", "link")
    ).toBe("[Published › My Heading](https://example.com/published#my-heading)");
  });

  it("leaves code and math untouched", () => {
    const source =
      "`[[Published]]`\n\n```\n[[Published]]\n```\n\n$[[Published]]$";
    expect(transformWikiLinks(source, app, "Note.md", "text")).toBe(source);
  });

  it("does not turn non-image note embeds into broken embeds", () => {
    expect(
      transformWikiLinks("![[Draft]]", app, "Note.md", "link")
    ).toBe("Draft");
  });

  it("rewrites Markdown links to published notes", () => {
    expect(
      transformWikiLinks(
        "[Read](Published.md)",
        app,
        "Note.md",
        "link"
      )
    ).toBe("[Read](https://example.com/published)");
  });
});
