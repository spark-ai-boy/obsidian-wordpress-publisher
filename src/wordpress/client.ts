import { requestUrl } from "obsidian";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import type {
  PostFormat,
  PostStatus,
  SiteProfile,
  WordPressCategory,
  WordPressMedia,
  WordPressPost,
  WordPressPostInput,
  WordPressTag,
  WordPressUser
} from "../types";
import { DEFAULT_CATEGORY_PAGE_SIZE, MAX_CATEGORY_PAGES } from "../constants";
import { encodeBasicAuth } from "../utils/base64";
import { errorMessage, WordPressError } from "../utils/errors";
import { t } from "../i18n";
import { apiUrl, normalizeSiteUrl } from "../utils/url";

export type HttpTransport = (
  request: RequestUrlParam
) => Promise<RequestUrlResponse>;

export const defaultTransport: HttpTransport = (request) => requestUrl(request);

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
  authenticated?: boolean;
}

function headerValue(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}

function buildQuery(
  query: Record<string, string | number | boolean | undefined> | undefined
): string {
  if (!query) {
    return "";
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function parseJsonSafely(response: RequestUrlResponse): unknown {
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    return undefined;
  }
}

function apiMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : undefined;
}

function apiCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.code === "string" ? record.code : undefined;
}

function mediaDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "-").replace(/["\\]/g, "-");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii || "image"}"; filename*=UTF-8''${encoded}`;
}

export interface RemoteFile {
  data: ArrayBuffer;
  contentType: string;
}

/**
 * Thin, typed wrapper around the WordPress REST API. All requests go through
 * Obsidian's requestUrl so they work on desktop and mobile without CORS issues.
 */
export class WordPressClient {
  readonly site: SiteProfile;
  private readonly transport: HttpTransport;
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(site: SiteProfile, transport: HttpTransport = defaultTransport) {
    if (!site.url || !normalizeSiteUrl(site.url)) {
      throw new WordPressError(t("connection.missingUrl"), {
        code: "missing_url"
      });
    }
    this.site = site;
    this.transport = transport;
    this.baseUrl = normalizeSiteUrl(site.url);
    this.authHeader = encodeBasicAuth(
      site.username,
      site.applicationPassword.replace(/\s+/g, "")
    );
  }

  hasCredentials(): boolean {
    return Boolean(this.site.username) && Boolean(this.site.applicationPassword);
  }

  private requestUrl(path: string, options: RequestOptions = {}): string {
    const absolute = /^https?:\/\//i.test(path);
    const url = absolute ? path : apiUrl(this.baseUrl, path);
    return `${url}${buildQuery(options.query)}`;
  }

  private async execute(
    path: string,
    options: RequestOptions = {}
  ): Promise<RequestUrlResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers ?? {})
    };
    if (options.authenticated !== false) {
      headers.Authorization = this.authHeader;
    }

    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers["Content-Type"] = "application/json";
    }

    let response: RequestUrlResponse;
    try {
      response = await this.transport({
        url: this.requestUrl(path, options),
        method: options.method ?? "GET",
        headers,
        body,
        throw: false
      });
    } catch (error) {
      throw new WordPressError(
        t("connection.network", { error: errorMessage(error) }),
        { code: "network_error", cause: error }
      );
    }

    if (response.status >= 200 && response.status < 300) {
      return response;
    }

    const payload = parseJsonSafely(response);
    const message = apiMessage(payload);
    const code = apiCode(payload);

    let friendly = message ?? t("connection.serverError", {
      status: response.status
    });
    if (response.status === 401) {
      friendly = t("connection.authFailed", { status: response.status });
    } else if (response.status === 403 && !message) {
      friendly = t("connection.forbidden");
    } else if (
      response.status === 404 &&
      (code === "rest_no_route" || !message)
    ) {
      friendly = t("connection.notFound");
    }

    throw new WordPressError(friendly, {
      status: response.status,
      code,
      details: payload
    });
  }

  private async requestJson<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const response = await this.execute(path, options);
    try {
      return JSON.parse(response.text) as T;
    } catch (error) {
      throw new WordPressError(t("connection.badJson"), {
        status: response.status,
        code: "invalid_json",
        details: response.text.slice(0, 500),
        cause: error
      });
    }
  }

  async testConnection(): Promise<WordPressUser> {
    return this.requestJson<WordPressUser>("/users/me", {
      query: { context: "edit" }
    });
  }

  async getPost(postId: number): Promise<WordPressPost> {
    return this.requestJson<WordPressPost>(`/posts/${postId}`, {
      query: { context: "edit" }
    });
  }

  async createPost(input: WordPressPostInput): Promise<WordPressPost> {
    return this.requestJson<WordPressPost>("/posts", {
      method: "POST",
      json: input
    });
  }

  async updatePost(
    postId: number,
    input: WordPressPostInput
  ): Promise<WordPressPost> {
    return this.requestJson<WordPressPost>(`/posts/${postId}`, {
      method: "POST",
      json: input
    });
  }

  async listCategories(): Promise<WordPressCategory[]> {
    const categories: WordPressCategory[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await this.execute("/categories", {
        query: {
          per_page: DEFAULT_CATEGORY_PAGE_SIZE,
          page,
          orderby: "name",
          order: "asc",
          hide_empty: false
        }
      });
      const batch = parseJsonSafely(response);
      if (!Array.isArray(batch)) {
        throw new WordPressError(t("connection.badJson"), {
          code: "invalid_categories"
        });
      }
      categories.push(...(batch as WordPressCategory[]));
      totalPages = Number(
        headerValue(response.headers, "x-wp-totalpages") ?? "1"
      );
      page += 1;
    } while (page <= totalPages && page <= MAX_CATEGORY_PAGES);

    return categories;
  }

  async createCategory(name: string): Promise<WordPressCategory> {
    return this.requestJson<WordPressCategory>("/categories", {
      method: "POST",
      json: { name }
    });
  }

  async listTags(search = ""): Promise<WordPressTag[]> {
    return this.requestJson<WordPressTag[]>("/tags", {
      query: {
        per_page: 100,
        orderby: "name",
        order: "asc",
        search: search || undefined
      }
    });
  }

  async getTagsByIds(ids: number[]): Promise<WordPressTag[]> {
    const unique = Array.from(new Set(ids.filter((id) => id > 0)));
    if (unique.length === 0) {
      return [];
    }
    const tags: WordPressTag[] = [];
    for (let index = 0; index < unique.length; index += 100) {
      const batch = unique.slice(index, index + 100);
      const response = await this.requestJson<WordPressTag[]>("/tags", {
        query: {
          include: batch.join(","),
          per_page: 100,
          orderby: "include"
        }
      });
      tags.push(...response);
    }
    return tags;
  }

  async createTag(name: string): Promise<WordPressTag> {
    try {
      return await this.requestJson<WordPressTag>("/tags", {
        method: "POST",
        json: { name }
      });
    } catch (error) {
      // A concurrent request may have created the tag between search and create.
      if (
        error instanceof WordPressError &&
        error.status === 400 &&
        error.code === "term_exists"
      ) {
        const details = error.details as
          | { data?: { term_id?: number } }
          | undefined;
        const termId = details?.data?.term_id;
        if (typeof termId === "number" && termId > 0) {
          return { id: termId, name, slug: "", count: 0 };
        }
      }
      throw error;
    }
  }

  /** Resolve tag names to IDs, creating missing tags in the process. */
  async ensureTags(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    const seen = new Set<string>();

    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) {
        continue;
      }
      const key = name.toLocaleLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const matches = await this.listTags(name);
      const exact = matches.find(
        (tag) => tag.name.toLocaleLowerCase() === key
      );
      if (exact) {
        ids.push(exact.id);
        continue;
      }
      const created = await this.createTag(name);
      ids.push(created.id);
    }

    return ids;
  }

  async uploadMedia(
    filename: string,
    data: ArrayBuffer,
    contentType: string,
    altText = ""
  ): Promise<WordPressMedia> {
    const response = await this.execute("/media", {
      method: "POST",
      body: data,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": mediaDisposition(filename)
      }
    });

    let media: WordPressMedia;
    try {
      media = JSON.parse(response.text) as WordPressMedia;
    } catch (error) {
      throw new WordPressError(t("connection.badJson"), {
        code: "invalid_media_response",
        cause: error
      });
    }

    if (altText.trim()) {
      try {
        return await this.requestJson<WordPressMedia>(`/media/${media.id}`, {
          method: "POST",
          json: { alt_text: altText.trim() }
        });
      } catch {
        // The upload succeeded; alt text is a best-effort enhancement.
        return media;
      }
    }

    return media;
  }

  /** Download a remote image without forwarding WordPress credentials. */
  async downloadRemoteFile(url: string): Promise<RemoteFile> {
    if (!/^https?:\/\//i.test(url)) {
      throw new WordPressError("Only http(s) URLs can be downloaded.", {
        code: "invalid_remote_url"
      });
    }

    let response: RequestUrlResponse;
    try {
      response = await this.transport({
        url,
        method: "GET",
        headers: { Accept: "image/*,*/*;q=0.8" },
        throw: false
      });
    } catch (error) {
      throw new WordPressError(
        t("connection.network", { error: errorMessage(error) }),
        { code: "remote_download_failed", cause: error }
      );
    }

    if (response.status < 200 || response.status >= 300) {
      throw new WordPressError(
        t("connection.serverError", { status: response.status }),
        { status: response.status, code: "remote_download_failed" }
      );
    }

    return {
      data: response.arrayBuffer,
      contentType:
        headerValue(response.headers, "content-type") ??
        "application/octet-stream"
    };
  }
}

/** Build the payload sent to /posts, omitting empty optional fields. */
export function buildPostInput(options: {
  title: string;
  content: string;
  excerpt: string;
  slug: string;
  status: PostStatus;
  scheduledDate?: string;
  categoryIds: number[];
  tagIds: number[];
  featuredMediaId?: number;
  format: PostFormat;
  commentStatus: "open" | "closed";
  pingStatus: "open" | "closed";
  sticky: boolean;
  password?: string;
  clearPassword?: boolean;
}): WordPressPostInput {
  const input: WordPressPostInput = {
    title: options.title,
    content: options.content,
    excerpt: options.excerpt,
    status: options.status,
    categories: options.categoryIds,
    tags: options.tagIds,
    format: options.format,
    comment_status: options.commentStatus,
    ping_status: options.pingStatus,
    sticky: options.sticky
  };
  if (options.slug.trim()) {
    input.slug = options.slug;
  }
  if (options.status === "future" && options.scheduledDate) {
    input.date = options.scheduledDate;
  }
  if (options.featuredMediaId !== undefined) {
    input.featured_media = options.featuredMediaId;
  }
  if (options.clearPassword) {
    input.password = "";
  } else if (options.password && options.password.trim()) {
    input.password = options.password;
  }

  return input;
}
