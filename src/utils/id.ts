/** Cross-platform ID generator with a fallback for older Obsidian runtimes. */
export function createId(): string {
  const cryptoObject = window.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
