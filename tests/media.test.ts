import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { TFile as TFileClass } from "obsidian";
import type { MediaCacheEntry, SiteProfile } from "../src/types";
import type { WordPressClient } from "../src/wordpress/client";
import { MediaService } from "../src/wordpress/media";

const site: SiteProfile = {
  id: "site-1",
  name: "Test",
  url: "https://example.com",
  username: "admin",
  applicationPassword: "abcd",
  defaultStatus: "draft",
  defaultFormat: "standard",
  defaultCategoryIds: [],
  defaultTags: []
};

function makeFile(path: string, size = 10, mtime = 100): TFile {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return Object.assign(Object.create(TFileClass.prototype), {
    path,
    name,
    basename: extension ? name.slice(0, -(extension.length + 1)) : name,
    extension,
    stat: { mtime, ctime: mtime, size }
  }) as TFile;
}

function makeApp(file: TFile): App {
  return {
    vault: {
      getAbstractFileByPath: (path: string) =>
        path === file.path ? file : null,
      readBinary: async () => new Uint8Array([1, 2, 3]).buffer
    },
    metadataCache: {
      getFirstLinkpathDest: (target: string) =>
        target === file.path ? file : null
    }
  } as unknown as App;
}

function makeClient(): {
  client: WordPressClient;
  upload: ReturnType<typeof vi.fn>;
} {
  const upload = vi.fn(async () => ({
    id: 11,
    source_url: "https://example.com/wp-content/uploads/img.png",
    alt_text: "",
    media_type: "image",
    mime_type: "image/png",
    title: { rendered: "img" }
  }));
  const client = {
    uploadMedia: upload,
    downloadRemoteFile: async () => ({
      data: new Uint8Array([9, 9]).buffer,
      contentType: "image/png"
    })
  } as unknown as WordPressClient;
  return { client, upload };
}

describe("MediaService", () => {
  it("uploads local images and rewrites wiki embeds", async () => {
    const file = makeFile("img.png");
    const { client, upload } = makeClient();
    const cache: Record<string, MediaCacheEntry> = {};
    const service = new MediaService(
      makeApp(file),
      client,
      site,
      cache,
      async () => undefined
    );

    const prepared = await service.prepareMarkdown(
      "![[img.png|Alt text]]",
      file,
      { uploadContentImages: true, uploadRemoteImages: false }
    );

    expect(prepared.markdown).toBe(
      "![Alt text](https://example.com/wp-content/uploads/img.png)"
    );
    expect(prepared.localImageCount).toBe(1);
    expect(prepared.uploadedImages).toHaveLength(1);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(Object.keys(cache)).toHaveLength(1);
  });

  it("reuses cached uploads for repeated references", async () => {
    const file = makeFile("img.png");
    const { client, upload } = makeClient();
    const service = new MediaService(
      makeApp(file),
      client,
      site,
      {},
      async () => undefined
    );

    await service.prepareMarkdown("![[img.png]] ![](img.png)", file, {
      uploadContentImages: true,
      uploadRemoteImages: false
    });

    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("leaves local images alone when uploading is disabled", async () => {
    const file = makeFile("img.png");
    const { client, upload } = makeClient();
    const service = new MediaService(
      makeApp(file),
      client,
      site,
      {},
      async () => undefined
    );

    const prepared = await service.prepareMarkdown("![[img.png|Alt]]", file, {
      uploadContentImages: false,
      uploadRemoteImages: false
    });

    expect(prepared.markdown).toBe("![[img.png|Alt]]");
    expect(prepared.localImageCount).toBe(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it("replaces a missing image with its alt text and records a warning", async () => {
    const file = makeFile("img.png");
    const { client } = makeClient();
    const service = new MediaService(
      makeApp(file),
      client,
      site,
      {},
      async () => undefined
    );

    const prepared = await service.prepareMarkdown(
      "![[missing.png|Alt]]",
      file,
      { uploadContentImages: true, uploadRemoteImages: false }
    );

    expect(prepared.markdown).toBe("Alt");
    expect(prepared.warnings).toHaveLength(1);
  });

  it("uploads remote images when enabled", async () => {
    const file = makeFile("note.md");
    const { client, upload } = makeClient();
    const service = new MediaService(
      makeApp(file),
      client,
      site,
      {},
      async () => undefined
    );

    const prepared = await service.prepareMarkdown(
      "![Remote](https://cdn.example.com/a.png)",
      file,
      { uploadContentImages: true, uploadRemoteImages: true }
    );

    expect(prepared.markdown).toBe(
      "![Remote](https://example.com/wp-content/uploads/img.png)"
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
