/** Utilities for normalizing WordPress site URLs and REST API paths. */

export function normalizeSiteUrl(input: string): string {
  let value = input.trim();
  if (!value) {
    return "";
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }
  if (!hasScheme) {
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/wp-json(?:\/.*)?$/i, "");
  path = path.replace(/\/+$/, "");

  return `${url.origin}${path}`;
}

export function isValidSiteUrl(input: string): boolean {
  try {
    const normalized = normalizeSiteUrl(input);
    return normalized.startsWith("http://") || normalized.startsWith("https://");
  } catch {
    return false;
  }
}

/** WordPress REST route root, for example https://example.com/wp-json/wp/v2. */
export function restApiUrl(siteUrl: string): string {
  return `${normalizeSiteUrl(siteUrl)}/wp-json/wp/v2`;
}

export function apiUrl(siteUrl: string, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${restApiUrl(siteUrl)}${suffix}`;
}

export function isSameSite(left: string, right: string): boolean {
  try {
    return normalizeSiteUrl(left) === normalizeSiteUrl(right);
  } catch {
    return false;
  }
}

export function displayHostname(siteUrl: string): string {
  try {
    return new URL(normalizeSiteUrl(siteUrl)).host;
  } catch {
    return siteUrl;
  }
}

export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Resolve a relative URL against a base URL, returning the input on failure. */
export function resolveUrl(baseUrl: string, value: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

/** Strip a WordPress REST path from a URL entered in settings. */
export function siteUrlFromRestUrl(input: string): string {
  return normalizeSiteUrl(input);
}

/** Only allow http(s) when opening links or downloading external resources. */
export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
