'use client';

/**
 * The 404's live "404": Stretch (docs/templates/01-text-titles.md §1.2) sets the number edge to
 * edge and breathes it along the width axis — 動き, literally — on a view of the landing's shared
 * render worker, in its first Look at 16:9. It loops while on screen, with a pause button
 * (WCAG 2.2.2); under reduced motion it rests on the template's poster frame with a play button.
 * Decorative: the canvas is hidden from assistive technology — the page's h1 says 404.
 */

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '@/design/icons';
import { galleryDesign } from '@/features/gallery/tile';
import { useLandingClient } from '@/features/landing/landing-client';
import {
  type Loaded,
  useEngineView,
  useInView,
  useReducedMotion,
} from '@/features/landing/use-engine-view';
import { cn } from '@/lib/cn';

const VIEW = 'not-found';
const TEMPLATE = 'stretch';
const TEXT = '404';

export default function NotFoundEngine() {
  const box = useRef<HTMLDivElement>(null);
  const { near, visible } = useInView(box, '0px');
  const client = useLandingClient(near);
  const reduced = useReducedMotion();
  const stage = useEngineView({
    client,
    view: VIEW,
    templateId: TEMPLATE,
    enabled: near,
    visible,
    maxDpr: 1.5,
  });
  /** The viewer's play/pause choice; until they make one, it plays unless motion is reduced. */
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reduced;

  // Once the template has loaded: its first Look with "404", looping from the start — or, under
  // reduced motion, resting on the poster frame (sent before the first frame, so no other shows).
  const start = useEffectEvent((loaded: Loaded) => {
    const { descriptor, state } = loaded;
    stage.send(galleryDesign(descriptor, state, { format: '16:9', headline: TEXT, look: 0 }));
    if (!client) return;
    client.setLoop(VIEW, true);
    if (playing) {
      client.seek(VIEW, 0);
      client.play(VIEW);
    } else {
      client.seek(VIEW, descriptor.poster);
    }
  });
  useEffect(() => {
    if (stage.loaded) start(stage.loaded);
  }, [stage.loaded]);

  // Reduced motion switched on or off while the page is open (and the viewer hasn't chosen).
  const follow = useEffectEvent((reduce: boolean) => {
    if (!client || !stage.loaded || choice !== null) return;
    if (reduce) {
      client.pause(VIEW);
      client.seek(VIEW, stage.loaded.descriptor.poster);
    } else {
      client.play(VIEW);
    }
  });
  useEffect(() => {
    follow(reduced);
  }, [reduced]);

  const toggle = () => {
    const next = !playing;
    setChoice(next);
    if (!client) return;
    if (next) client.play(VIEW);
    else client.pause(VIEW);
  };

  return (
    <div ref={box} className="absolute inset-0">
      <div
        ref={stage.host}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 opacity-0 transition-opacity duration-(--duration-medium) ease-glide',
          stage.ready && 'opacity-100',
        )}
      />
      {stage.ready ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          title={playing ? 'Pause' : 'Play'}
          className="absolute right-3 bottom-3 inline-flex size-11 items-center justify-center rounded-full bg-black/55 text-white transition-[background-color,scale] duration-(--duration-micro) ease-swift hover:bg-black/75 active:scale-[0.94] md:right-4 md:bottom-4 md:size-10"
        >
          {playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
      ) : null}
    </div>
  );
}
