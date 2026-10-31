import { describe, expect, it } from "vitest";
import {
  apiUrl,
  isSafeExternalUrl,
  isSameSite,
  isValidSiteUrl,
  normalizeSiteUrl,
  restApiUrl
} from "../src/utils/url";

describe("URL helpers", () => {
  it("normalizes site URLs including subdirectories", () => {
    expect(normalizeSiteUrl("https://example.com/")).toBe(
      "https://example.com"
    );
    expect(normalizeSiteUrl("example.com/blog/")).toBe(
      "https://example.com/blog"
    );
    expect(
      normalizeSiteUrl("https://example.com/blog/wp-json/wp/v2/")
    ).toBe("https://example.com/blog");
    expect(
      normalizeSiteUrl("https://example.com/blog/wp-json/wp/v2/posts/1")
    ).toBe("https://example.com/blog");
    expect(normalizeSiteUrl("http://localhost:8080")).toBe(
      "http://localhost:8080"
    );
  });

  it("builds REST URLs", () => {
    expect(restApiUrl("https://example.com/blog/")).toBe(
      "https://example.com/blog/wp-json/wp/v2"
    );
    expect(apiUrl("https://example.com", "/posts/1")).toBe(
      "https://example.com/wp-json/wp/v2/posts/1"
    );
  });

  it("compares normalized sites", () => {
    expect(
      isSameSite("https://example.com/", "https://example.com/wp-json")
    ).toBe(true);
    expect(isSameSite("https://a.com", "https://b.com")).toBe(false);
  });

  it("validates URLs", () => {
    expect(isValidSiteUrl("example.com")).toBe(true);
    expect(isValidSiteUrl("ftp://example.com")).toBe(false);
    expect(isValidSiteUrl("")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(() => normalizeSiteUrl("not a url")).toThrow();
  });

  it("allows only http(s) links to open externally", () => {
    expect(isSafeExternalUrl("https://example.com/post")).toBe(true);
    expect(isSafeExternalUrl("http://example.com/post")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalUrl("data:text/html,x")).toBe(false);
  });
});
