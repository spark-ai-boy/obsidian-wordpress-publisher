import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { TFile as TFileClass } from "obsidian";
import { DEFAULT_SETTINGS, createSiteProfile } from "../src/constants";
import type { SiteProfile } from "../src/types";
import { NoteService } from "../src/wordpress/notes";

const site: SiteProfile = createSiteProfile("site-1", {
  name: "Test",
  url: "https://example.com",
  username: "admin",
  applicationPassword: "abcd"
});

function makeFile(): TFile {
  return Object.assign(Object.create(TFileClass.prototype), {
    path: "Notes/Post.md",
    name: "Post.md",
    basename: "Post",
    extension: "md",
    stat: { mtime: 1, ctime: 1, size: 1 }
  }) as TFile;
}

function makeApp(markdown: string, frontmatter: Record<string, unknown>): App {
  return {
    vault: { read: async () => markdown },
    metadataCache: {
      getFileCache: () => ({ frontmatter, tags: [] })
    }
  } as unknown as App;
}

describe("NoteService", () => {
  it("uses a leading H1 and generates auto slug/excerpt", async () => {
    const file = makeFile();
    const app = makeApp("# My Post\n\nA short body.", {});
    const service = new NoteService(app);
    const note = await service.read(file, site, DEFAULT_SETTINGS);

    expect(note.title).toBe("My Post");
    expect(note.slug).toBe("my-post");
    expect(note.slugExplicit).toBe(false);
    expect(note.excerpt).toContain("A short body");
    expect(note.excerptExplicit).toBe(false);
  });

  it("marks explicit slug and excerpt values", async () => {
    const file = makeFile();
    const app = makeApp("Body", {
      wordpress_slug: "custom-slug",
      wordpress_excerpt: "Custom summary"
    });
    const service = new NoteService(app);
    const note = await service.read(file, site, DEFAULT_SETTINGS);

    expect(note.slug).toBe("custom-slug");
    expect(note.slugExplicit).toBe(true);
    expect(note.excerpt).toBe("Custom summary");
    expect(note.excerptExplicit).toBe(true);
  });

  it("passes preservation flags into default options", async () => {
    const file = makeFile();
    const app = makeApp("Body", {});
    const service = new NoteService(app);
    const note = await service.read(file, site, DEFAULT_SETTINGS);
    const options = service.buildOptions(note, site, DEFAULT_SETTINGS);

    expect(options.preserveSlug).toBe(true);
    expect(options.preserveExcerpt).toBe(true);
  });
});
