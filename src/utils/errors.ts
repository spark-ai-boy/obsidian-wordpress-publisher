import type { WordPressPost } from "../types";

export interface WordPressErrorOptions {
  status?: number;
  code?: string;
  details?: unknown;
  cause?: unknown;
}

/** Error raised by the WordPress REST client, preserving the API response. */
export class WordPressError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options: WordPressErrorOptions = {}) {
    super(message);
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
    this.name = "WordPressError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

export function isWordPressError(error: unknown): error is WordPressError {
  return error instanceof WordPressError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

/** Thrown when a remote post changed after the note's last sync. */
export class RemoteConflictError extends WordPressError {
  readonly remote: WordPressPost;

  constructor(remote: WordPressPost) {
    super("Remote post changed", { code: "remote_conflict", status: 409 });
    this.name = "RemoteConflictError";
    this.remote = remote;
  }
}
