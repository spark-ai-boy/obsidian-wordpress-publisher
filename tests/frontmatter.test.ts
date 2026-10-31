import { describe, expect, it } from "vitest";
import {
  getNoteExcerpt,
  getNoteFeaturedImage,
  getNoteSlug,
  getNoteTags,
  readNoteMeta
} from "../src/utils/frontmatter";

describe("frontmatter helpers", () => {
  it("reads plugin metadata from mixed YAML value types", () => {
    const meta = readNoteMeta({
      wordpress_id: "42",
      wordpress_url: "https://example.com/post",
      wordpress_site: "https://example.com",
      wordpress_status: "future",
      wordpress_categories: ["1", 2, 0],
      wordpress_tags: "news, updates",
      wordpress_featured_media: 7,
      wordpress_format: "aside",
      wordpress_last_sync: "2026-01-01T00:00:00.000Z"
    });

    expect(meta).toMatchObject({
      postId: 42,
      postUrl: "https://example.com/post",
      siteUrl: "https://example.com",
      status: "future",
      tags: ["news", "updates"],
      featuredMedia: 7,
      format: "aside"
    });
    expect(meta.categories).toEqual([1, 2]);
  });

  it("ignores invalid statuses and formats", () => {
    const meta = readNoteMeta({
      wordpress_status: "trash",
      wordpress_format: "custom"
    });
    expect(meta.status).toBeUndefined();
    expect(meta.format).toBeUndefined();
  });

  it("reads tags from both tags and tag keys", () => {
    expect(getNoteTags({ tags: ["a", "b"], tag: "#c" })).toEqual([
      "a",
      "b",
      "c"
    ]);
  });

  it("normalizes featured image references", () => {
    expect(
      getNoteFeaturedImage({ wordpress_featured_image: "[[images/a.png]]" })
    ).toBe("images/a.png");
    expect(getNoteFeaturedImage({ cover: "![x](assets/cover.jpg)" })).toBe(
      "assets/cover.jpg"
    );
  });

  it("falls back between excerpt, slug and title fields", () => {
    expect(getNoteExcerpt({ description: "A description" })).toBe(
      "A description"
    );
    expect(getNoteSlug({ slug: "my-post" })).toBe("my-post");
  });
});
