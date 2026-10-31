/**
 * Encode UTF-8 credentials for HTTP Basic authentication without relying on
 * Node's Buffer (the plugin also runs on Obsidian mobile).
 */
export function encodeBasicAuth(username: string, password: string): string {
  const value = `${username}:${password}`;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `Basic ${btoa(binary)}`;
}
