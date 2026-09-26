/**
 * Font byte loading. Engine fonts ship as gzip-compressed TTF (scripts/fonts.py) so delivery never
 * depends on the host's HTTP compression; we inflate them with the platform's DecompressionStream.
 * If a server or proxy already decoded the gzip transfer, the magic-byte check skips inflation.
 */

export type FontBytesLoader = (url: string) => Promise<ArrayBuffer>;

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function gunzipIfNeeded(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer);
  if (!isGzip(bytes)) return buffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** Default loader for browsers and workers: fetch from the same origin, then inflate. */
export function createFetchLoader(baseUrl = ''): FontBytesLoader {
  return async (url) => {
    const response = await fetch(`${baseUrl}${url}`);
    if (!response.ok) throw new Error(`Font request failed (${response.status}): ${url}`);
    return gunzipIfNeeded(await response.arrayBuffer());
  };
}
