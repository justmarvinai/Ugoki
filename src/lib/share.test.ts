import { deflateSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { DesignState } from '@/engine/host';
import { decodeShare, encodeShare, sharePayload, shareUrl } from './share';

const design: DesignState = {
  templateId: 'sheen',
  templateVersion: 1,
  props: {
    logo: { kind: 'user', hash: 'a'.repeat(64), name: 'mark.svg' },
    tagline: 'Built to last — ¡sí! 動き',
  },
  format: '9:16',
  duration: 5.5,
  energy: 'punchy',
  palette: { kind: 'brand', color: '#5a2be8', variant: 'dark' },
  pairing: 'grotesk',
  transparent: true,
  finish: 'grain',
  seed: 42,
  layout: { logo: { x: 1.5, y: -2, scale: 1.2 } },
};

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

describe('share links', () => {
  it('round-trip a design, leaving the user’s images out', () => {
    const shared = decodeShare(encodeShare(design));
    expect(shared).not.toBeNull();
    expect(shared?.templateId).toBe('sheen');
    expect(shared?.templateVersion).toBe(1);
    expect(shared?.imagesLeftOut).toBe(true);
    const { props, ...rest } = design;
    expect(shared?.state).toEqual({ ...rest, props: { tagline: props.tagline } });
  });

  it('are short, URL-safe and on this site', () => {
    const payload = encodeShare(design);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThan(400);
    const url = shareUrl(design, 'https://ugoki.example');
    expect(url).toBe(`https://ugoki.example/editor/sheen#d=${payload}`);
    expect(sharePayload(new URL(url).hash)).toBe(payload);
  });

  it('turn down anything else', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('not base64 at all!')).toBeNull();
    expect(decodeShare(base64url(strToU8('plain text')))).toBeNull();
    const wrongVersion = deflateSync(strToU8(JSON.stringify({ v: 2, t: 'rise', tv: 1, s: {} })));
    expect(decodeShare(base64url(wrongVersion))).toBeNull();
    const noState = deflateSync(strToU8(JSON.stringify({ v: 1, t: 'rise', tv: 1 })));
    expect(decodeShare(base64url(noState))).toBeNull();
    expect(sharePayload('#x=1')).toBeNull();
  });

  it('refuse payloads that inflate far beyond a design (deflate bombs)', () => {
    const bomb = deflateSync(
      strToU8(JSON.stringify({ v: 1, t: 'rise', tv: 1, s: { pad: ' '.repeat(2_000_000) } })),
      { level: 9 },
    );
    expect(bomb.length).toBeLessThan(10_000);
    expect(decodeShare(base64url(bomb))).toBeNull();
  });
});
