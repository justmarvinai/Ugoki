/**
 * Share links (docs/05-architecture.md §8): a design in the URL hash — never sent to a server.
 * `{ v: 1, t: templateId, tv: templateVersion, s: state, i?: 1 }` → JSON → raw DEFLATE →
 * base64url, in `/editor/<id>#d=…`. The user's own images stay on their device: their slots
 * are left out (the template's defaults stand in) and `i` says so. Decoding checks the
 * envelope's shape only — the render worker sanitizes and migrates the state itself.
 */

import { deflateSync, Inflate, strFromU8, strToU8 } from 'fflate';
import * as z from 'zod/mini';
import type { DesignState } from '@/engine/host';

/** Links longer than this may be cut by some apps and chat clients. */
export const LONG_LINK = 8 * 1024;
/** Inflated payloads beyond this are rejected (a link can't hold a real design that big). */
const MAX_JSON = 256 * 1024;

const Envelope = z.object({
  v: z.literal(1),
  t: z.string().check(z.minLength(1), z.maxLength(64)),
  tv: z.int().check(z.minimum(1)),
  s: z.record(z.string(), z.unknown()),
  i: z.optional(z.literal(1)),
});

export type SharedDesign = {
  templateId: string;
  templateVersion: number;
  /** The design as it came (unsanitized: the worker sanitizes it on load). */
  state: Record<string, unknown>;
  /** The sender's own images were left out. */
  imagesLeftOut: boolean;
};

const isUserFile = (value: unknown) =>
  typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'user';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Inflates raw DEFLATE, giving up past `MAX_JSON` bytes. */
function inflateCapped(bytes: Uint8Array): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let tooBig = false;
  const inflate = new Inflate((chunk) => {
    size += chunk.length;
    if (size > MAX_JSON) tooBig = true;
    else chunks.push(chunk);
  });
  for (let i = 0; i < bytes.length && !tooBig; i += 4096) {
    inflate.push(bytes.subarray(i, i + 4096), i + 4096 >= bytes.length);
  }
  if (tooBig) return null;
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The `#d=` payload for a design. */
export function encodeShare(design: DesignState): string {
  const { templateId, templateVersion, ...rest } = design;
  let imagesLeftOut = false;
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest.props)) {
    if (isUserFile(value)) imagesLeftOut = true;
    else props[key] = value;
  }
  const envelope = {
    v: 1,
    t: templateId,
    tv: templateVersion,
    s: { ...rest, props },
    ...(imagesLeftOut ? { i: 1 } : {}),
  };
  return toBase64Url(deflateSync(strToU8(JSON.stringify(envelope)), { level: 9 }));
}

/** A share link for a design, on this site. */
export function shareUrl(design: DesignState, origin: string): string {
  return `${origin}/editor/${design.templateId}#d=${encodeShare(design)}`;
}

/** The design in a `#d=` payload, or null if it isn't one we can read. */
export function decodeShare(payload: string): SharedDesign | null {
  try {
    const json = inflateCapped(fromBase64Url(payload.trim()));
    if (!json) return null;
    const parsed = Envelope.safeParse(JSON.parse(strFromU8(json)));
    if (!parsed.success) return null;
    const { t, tv, s, i } = parsed.data;
    return {
      templateId: t,
      templateVersion: tv,
      state: { ...s, templateId: t, templateVersion: tv },
      imagesLeftOut: i === 1,
    };
  } catch {
    return null;
  }
}

/** The share payload in a URL hash (`#d=…`), if any. */
export function sharePayload(hash: string): string | null {
  const match = /^#?d=([A-Za-z0-9_-]+)$/.exec(hash);
  return match?.[1] ?? null;
}
