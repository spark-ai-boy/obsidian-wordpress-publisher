import { describe, expect, it } from "vitest";
import { WordPressClient, buildPostInput } from "../src/wordpress/client";
import type { SiteProfile } from "../src/types";
import { WordPressError } from "../src/utils/errors";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";

const site: SiteProfile = {
  id: "site-1",
  name: "Test",
  url: "https://example.com/blog/",
  username: "admin",
  applicationPassword: "abcd efgh",
  defaultStatus: "draft",
  defaultFormat: "standard",
  defaultCategoryIds: [],
  defaultTags: []
};

function response(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): RequestUrlResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const encoded = new TextEncoder().encode(text);
  return {
    status,
    headers,
    text,
    json: typeof body === "string" ? undefined : body,
    arrayBuffer: encoded.buffer
  } as RequestUrlResponse;
}

describe("WordPressClient", () => {
  it("normalizes the site URL and sends basic auth", async () => {
    let captured: RequestUrlParam | undefined;
    const client = new WordPressClient(site, async (request) => {
      captured = request;
      return response(200, { id: 1, name: "Admin" });
    });

    const user = await client.testConnection();

    expect(user.name).toBe("Admin");
    expect(captured?.url).toBe(
      "https://example.com/blog/wp-json/wp/v2/users/me?context=edit"
    );
    expect(captured?.headers?.Authorization).toBe(
      `Basic ${btoa("admin:abcdefgh")}`
    );
    expect(captured?.headers?.Accept).toBe("application/json");
  });

  it("paginates categories using X-WP-TotalPages", async () => {
    const urls: string[] = [];
    const client = new WordPressClient(site, async (request) => {
      urls.push(request.url);
      if (new URL(request.url).searchParams.get("page") === "1") {
        return response(
          200,
          [{ id: 1, name: "News", slug: "news", parent: 0, count: 2 }],
          { "x-wp-totalpages": "2" }
        );
      }
      return response(200, [
        { id: 2, name: "Guides", slug: "guides", parent: 0, count: 1 }
      ]);
    });

    const categories = await client.listCategories();

    expect(categories.map((category) => category.id)).toEqual([1, 2]);
    expect(urls).toHaveLength(2);
  });

  it("turns authentication failures into a WordPressError", async () => {
    const client = new WordPressClient(site, async () =>
      response(401, {
        code: "rest_forbidden",
        message: "Sorry, you are not allowed to do that."
      })
    );

    await expect(client.testConnection()).rejects.toMatchObject({
      name: "WordPressError",
      status: 401,
      code: "rest_forbidden"
    });
  });

  it("creates missing tags and reuses exact matches", async () => {
    const calls: Array<{ method: string; url: string; body?: string }> = [];
    const client = new WordPressClient(site, async (request) => {
      calls.push({
        method: request.method ?? "GET",
        url: request.url,
        body: typeof request.body === "string" ? request.body : undefined
      });
      if (request.method === "POST") {
        return response(201, { id: 9, name: "New", slug: "new", count: 0 });
      }
      if (request.url.includes("search=Travel")) {
        return response(200, [
          { id: 3, name: "Travel", slug: "travel", count: 4 }
        ]);
      }
      return response(200, []);
    });

    const ids = await client.ensureTags(["Travel", "New", "travel"]);

    expect(ids).toEqual([3, 9]);
    const post = calls.find((call) => call.method === "POST");
    expect(post?.url).toContain("/wp-json/wp/v2/tags");
    expect(post?.body).toContain('"name":"New"');
  });

  it("uploads binary media with a filename and content type", async () => {
    let captured: RequestUrlParam | undefined;
    const client = new WordPressClient(site, async (request) => {
      captured = request;
      return response(201, {
        id: 42,
        source_url: "https://example.com/photo.jpg",
        alt_text: "",
        media_type: "image",
        mime_type: "image/jpeg",
        title: { rendered: "photo" }
      });
    });

    const media = await client.uploadMedia(
      "photo.jpg",
      new Uint8Array([1, 2, 3]).buffer,
      "image/jpeg"
    );

    expect(media.id).toBe(42);
    expect(captured?.url).toContain("/wp-json/wp/v2/media");
    expect(captured?.headers?.["Content-Type"]).toBe("image/jpeg");
    expect(captured?.headers?.["Content-Disposition"]).toContain(
      'filename="photo.jpg"'
    );
    expect(captured?.body).toBeInstanceOf(ArrayBuffer);
  });

  it("does not forward WordPress credentials when downloading remote files", async () => {
    let captured: RequestUrlParam | undefined;
    const client = new WordPressClient(site, async (request) => {
      captured = request;
      return response(200, new Uint8Array([4, 5]).buffer, {
        "content-type": "image/png"
      });
    });

    const file = await client.downloadRemoteFile("https://cdn.example.com/a.png");

    expect(file.contentType).toBe("image/png");
    expect(captured?.headers?.Authorization).toBeUndefined();
  });

  it("wraps network failures", async () => {
    const client = new WordPressClient(site, async () => {
      throw new Error("offline");
    });

    await expect(client.testConnection()).rejects.toBeInstanceOf(
      WordPressError
    );
    await expect(client.testConnection()).rejects.toMatchObject({
      code: "network_error"
    });
  });
});

describe("buildPostInput", () => {
  it("omits empty optional fields and includes a scheduled date", () => {
    const input = buildPostInput({
      title: "Hello",
      content: "<p>Body</p>",
      excerpt: "",
      slug: "",
      status: "future",
      scheduledDate: "2026-12-01T09:30:00",
      categoryIds: [1],
      tagIds: [2],
      featuredMediaId: 0,
      format: "standard",
      commentStatus: "open",
      pingStatus: "closed",
      sticky: false,
      password: ""
    });

    expect(input).toMatchObject({
      title: "Hello",
      status: "future",
      date: "2026-12-01T09:30:00",
      categories: [1],
      tags: [2],
      featured_media: 0,
      ping_status: "closed"
    });
    expect(input.excerpt).toBe("");
    expect(input.slug).toBeUndefined();
    expect(input.password).toBeUndefined();
  });

  it("can explicitly clear an existing password", () => {
    const input = buildPostInput({
      title: "Hello",
      content: "<p>Body</p>",
      excerpt: "",
      slug: "",
      status: "publish",
      categoryIds: [],
      tagIds: [],
      format: "standard",
      commentStatus: "open",
      pingStatus: "open",
      sticky: false,
      password: "ignored",
      clearPassword: true
    });
    expect(input.password).toBe("");
  });
});
