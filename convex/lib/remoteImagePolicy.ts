"use node";

import { BlockList, isIP } from "node:net";

export type RemoteImageProvider = "instagram" | "facebook" | "tiktok" | "website" | "pollinations";
export type RemoteImageErrorCode =
  | "REMOTE_IMAGE_BLOCKED"
  | "REMOTE_IMAGE_TOO_LARGE"
  | "REMOTE_IMAGE_INVALID_TYPE"
  | "REMOTE_IMAGE_TIMEOUT"
  | "REMOTE_IMAGE_REDIRECT"
  | "REMOTE_IMAGE_HTTP_ERROR"
  | "REMOTE_IMAGE_DNS_ERROR"
  | "REMOTE_IMAGE_FETCH_FAILED";

export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REMOTE_IMAGE_REDIRECTS = 3;

const PROVIDER_HOSTS: Record<Exclude<RemoteImageProvider, "website">, readonly string[]> = {
  instagram: ["instagram.com", "cdninstagram.com", "fbcdn.net", "fbsbx.com"],
  facebook: ["facebook.com", "fb.watch", "fbcdn.net", "fbsbx.com"],
  tiktok: ["tiktok.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ttwstatic.com", "muscdn.com"],
  pollinations: ["pollinations.ai"],
};

const blockedIpv4 = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blockedIpv4.addSubnet(address, prefix, "ipv4");

const blockedIpv6 = new BlockList();
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96],
  ["64:ff9b:1::", 48], ["100::", 64], ["2001::", 23], ["2001:db8::", 32],
  ["2002::", 16], ["3fff::", 20], ["5f00::", 16], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8],
] as const) blockedIpv6.addSubnet(address, prefix, "ipv6");

export class RemoteImageError extends Error {
  readonly code: RemoteImageErrorCode;

  constructor(code: RemoteImageErrorCode) {
    super(code);
    this.name = "RemoteImageError";
    this.code = code;
  }
}

const blocked = (code: RemoteImageErrorCode): never => {
  throw new RemoteImageError(code);
};

export function hostMatchesSuffix(host: string, suffix: string): boolean {
  const normalizedHost = host.toLowerCase().replace(/\.$/, "");
  const normalizedSuffix = suffix.toLowerCase();
  return normalizedHost === normalizedSuffix || normalizedHost.endsWith(`.${normalizedSuffix}`);
}

export function isPublicIpAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return !blockedIpv4.check(normalized, "ipv4");
  if (family === 6) return !blockedIpv6.check(normalized, "ipv6");
  return false;
}

export function assertPublicAddresses(addresses: readonly string[]): void {
  if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address))) {
    blocked("REMOTE_IMAGE_BLOCKED");
  }
}

export function validateRemoteUrl(input: string, provider: RemoteImageProvider): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return blocked("REMOTE_IMAGE_BLOCKED");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
    host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
    host.endsWith(".internal") || host.endsWith(".home.arpa") ||
    (isIP(host) !== 0 && !isPublicIpAddress(host))
  ) blocked("REMOTE_IMAGE_BLOCKED");

  if (provider !== "website" && !PROVIDER_HOSTS[provider].some((suffix) => hostMatchesSuffix(host, suffix))) {
    blocked("REMOTE_IMAGE_BLOCKED");
  }
  return url;
}

export function validateRedirect(
  currentUrl: URL,
  location: string | undefined,
  provider: RemoteImageProvider,
  followedRedirects: number,
): URL {
  if (!location || followedRedirects >= MAX_REMOTE_IMAGE_REDIRECTS) {
    return blocked("REMOTE_IMAGE_REDIRECT");
  }
  return validateRemoteUrl(new URL(location, currentUrl).toString(), provider);
}

export function assertContentLength(value: string | undefined, maxBytes: number): void {
  if (value === undefined) return;
  if (!/^\d+$/.test(value) || Number(value) > maxBytes) blocked("REMOTE_IMAGE_TOO_LARGE");
}

export async function readLimitedBody(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maxBytes) blocked("REMOTE_IMAGE_TOO_LARGE");
    chunks.push(chunk);
  }

  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

const matches = (bytes: Uint8Array, expected: readonly number[], offset = 0): boolean =>
  expected.every((byte, index) => bytes[offset + index] === byte);

export function validateImageType(contentTypeHeader: string | undefined, bytes: Uint8Array): string {
  const contentType = contentTypeHeader?.split(";", 1)[0].trim().toLowerCase();
  const valid =
    (contentType === "image/jpeg" && matches(bytes, [0xff, 0xd8, 0xff])) ||
    (contentType === "image/png" && matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (contentType === "image/webp" && matches(bytes, [0x52, 0x49, 0x46, 0x46]) && matches(bytes, [0x57, 0x45, 0x42, 0x50], 8)) ||
    (contentType === "image/avif" && matches(bytes, [0x66, 0x74, 0x79, 0x70], 4) &&
      ["avif", "avis"].includes(new TextDecoder().decode(bytes.subarray(8, 12))));
  if (!valid) blocked("REMOTE_IMAGE_INVALID_TYPE");
  return contentType;
}

export function remoteImageErrorCode(error: unknown): RemoteImageErrorCode {
  return error instanceof RemoteImageError ? error.code : "REMOTE_IMAGE_FETCH_FAILED";
}
