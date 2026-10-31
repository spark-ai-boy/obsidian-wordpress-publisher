import { describe, expect, it } from "vitest";
import {
  excerptFromMarkdown,
  extractLeadingH1,
  maskProtectedContent,
  parseIdList,
  parseTagList,
  plainText,
  stripFrontmatter,
  stripMatchingH1,
  stripObsidianComments
} from "../src/utils/markdown";
import { firstImageSource } from "../src/utils/images";
import { slugify } from "../src/utils/path";

describe("markdown helpers", () => {
  it("strips only leading YAML frontmatter", () => {
    const note = "---\ntitle: Hello\n---\n\nBody\n\n---\n\nMore";
    expect(stripFrontmatter(note)).toBe("\nBody\n\n---\n\nMore");
    expect(stripFrontmatter("Body\n\n---\n\nMore")).toBe("Body\n\n---\n\nMore");
  });

  it("extracts a leading H1 and removes it from the body", () => {
    const note = "\n# My **Title**\n\nParagraph";
    const result = extractLeadingH1(note);
    expect(result?.title).toBe("My **Title**");
    expect(result?.body).toBe("Paragraph");
  });

  it("does not treat a later H1 as the title", () => {
    expect(extractLeadingH1("Intro\n\n# Later")).toBeNull();
  });

  it("removes the H1 only when it matches the title", () => {
    expect(stripMatchingH1("# Hello\n\nBody", "Hello")).toBe("Body");
    expect(stripMatchingH1("# Hello\n\nBody", "Other")).toBe(
      "# Hello\n\nBody"
    );
  });

  it("removes Obsidian comments", () => {
    expect(stripObsidianComments("A %%hidden%% B %%more\nhidden%% C")).toBe(
      "A  B  C"
    );
  });

  it("parses tags with English/Chinese separators and de-duplicates", () => {
    expect(parseTagList("#Travel, food，travel; 笔记\n#done")).toEqual([
      "Travel",
      "food",
      "笔记",
      "done"
    ]);
  });

  it("parses category ID lists from frontmatter", () => {
    expect(parseIdList(["1", 2, "x", 2, 0])).toEqual([1, 2]);
    expect(parseIdList("3, 4 5")).toEqual([3, 4, 5]);
    expect(parseIdList(7)).toEqual([7]);
  });

  it("converts inline markdown to plain text", () => {
    expect(
      plainText(
        "# Heading\n\nA [[Note|wikilink]] and [markdown](https://example.com) and `code`."
      )
    ).toBe("Heading A wikilink and markdown and code.");
  });

  it("builds a short excerpt", () => {
    const excerpt = excerptFromMarkdown(
      "---\ntitle: x\n---\n\n" + "word ".repeat(80),
      40
    );
    expect(excerpt.length).toBeLessThanOrEqual(41);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("masks code and restores it unchanged", () => {
    const source = "Text `[[inside]]` and\n```\n[[block]]\n```\n[[link]]";
    const masked = maskProtectedContent(source);
    expect(masked.text).not.toContain("[[inside]]");
    expect(masked.text).not.toContain("[[block]]");
    expect(masked.restore(masked.text)).toBe(source);
  });

  it("creates ASCII slugs and leaves CJK to WordPress", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("中文标题")).toBe("");
  });

  it("finds the first image source outside code", () => {
    expect(firstImageSource("Text\n\n![[images/photo.png|Alt]]")).toBe(
      "images/photo.png"
    );
    expect(firstImageSource("`![[code.png]]`\n![Alt](assets/a.jpg)")).toBe(
      "assets/a.jpg"
    );
    expect(firstImageSource("![[SomeNote]] then ![[photo.png]]")).toBe(
      "photo.png"
    );
    expect(firstImageSource("No images")).toBeUndefined();
  });
});
