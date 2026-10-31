/** Convert WordPress-rendered HTML to plain text without executing scripts. */
export function htmlToText(html: string): string {
  const value = html.trim();
  if (!value) {
    return "";
  }
  if (typeof DOMParser !== "undefined") {
    const parsed = new DOMParser().parseFromString(value, "text/html");
    return (parsed.body.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
