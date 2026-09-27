/** Turns a user's file as the page sends it (vector artwork, or a transferred bitmap) into a graphic. */

import type { TransferableGraphic } from '../host/protocol';
import type { Graphic } from './types';

export function graphicFromTransfer(asset: TransferableGraphic): Graphic {
  if (asset.kind === 'vector') return asset.graphic;
  const { bitmap, ink } = asset;
  return {
    kind: 'raster',
    image: { source: bitmap, width: bitmap.width, height: bitmap.height },
    ink,
  };
}
