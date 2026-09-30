'use client';

/**
 * One live engine canvas on a marketing page (docs/02-experience.md §4): a worker view on the
 * landing's shared render worker, attached when its section comes near the viewport and rendered
 * only while it is visible. The canvas is created imperatively (control transfers once; React may
 * mount twice) inside `host`, which CSS sizes; resizes follow the element.
 *
 *   const stage = useEngineView({ client, view: 'hero:rise', templateId: 'rise', enabled, visible });
 *   <div ref={stage.host} className="aspect-video" />
 *   useEffect(() => { if (stage.loaded) stage.send(galleryDesign(...)); }, [stage.loaded, text]);
 *
 * Transport goes straight to the client: `stage.client?.play(stage.view)`, `seek(view, t, true)`.
 */

import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import type {
  DesignState,
  FrameInfo,
  RenderClient,
  TemplateDescriptor,
  ViewId,
  ViewRole,
  WorkerMessage,
} from '@/engine/host';

export type Loaded = { descriptor: TemplateDescriptor; state: DesignState };

export type Built = Extract<WorkerMessage, { type: 'built' }>;

export type EngineView = {
  /** The element that holds the canvas (sized by CSS; the canvas fills it). */
  host: RefObject<HTMLDivElement | null>;
  client: RenderClient | null;
  view: ViewId;
  /** The template's description and its sanitized first state, once loaded. */
  loaded: Loaded | null;
  /** The latest build (duration, sections, cut), or null before the first. */
  built: Built | null;
  /** True once a frame of the latest design has been painted (fade a poster out on it). */
  ready: boolean;
  /** Sends a design. The worker sanitizes it; `ready` turns false until its first frame. */
  send: (state: DesignState) => void;
};

type Options = {
  client: RenderClient | null;
  view: ViewId;
  templateId: string;
  /** Attach and load only once this is true (e.g. the section is near the viewport). */
  enabled: boolean;
  /** Build and render only while this is true (in view). */
  visible: boolean;
  /** `stage` (default) renders paused frames with motion blur; `tile` is lighter. */
  role?: ViewRole;
  /** Device-pixel-ratio cap (default 2; big stages on 2× screens may use 1.5). */
  maxDpr?: number;
  /** A design to open instead of the template's first Look. */
  design?: unknown;
  onFrame?: (frame: FrameInfo) => void;
};

export function useEngineView({
  client,
  view,
  templateId,
  enabled,
  visible,
  role = 'stage',
  maxDpr = 2,
  design,
  onFrame,
}: Options): EngineView {
  const host = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [built, setBuilt] = useState<Built | null>(null);
  const [ready, setReady] = useState(false);
  /** Frames are shown only after the latest design was built. */
  const awaiting = useRef<'built' | 'frame' | null>(null);
  const initial = useRef(design);
  const attached = useRef(false);

  const onMessage = useEffectEvent((message: WorkerMessage) => {
    switch (message.type) {
      case 'loaded':
        if (message.view !== view) return;
        setLoaded({ descriptor: message.template, state: message.state });
        break;
      case 'built':
        if (message.view !== view) return;
        setBuilt(message);
        if (awaiting.current === 'built') awaiting.current = 'frame';
        break;
      case 'frame':
        if (message.view !== view) return;
        if (awaiting.current === 'frame') {
          awaiting.current = null;
          setReady(true);
        }
        onFrame?.(message);
        break;
    }
  });

  useEffect(() => {
    const element = host.current;
    if (!client || !enabled || !element) return;
    const size = () => {
      const rect = element.getBoundingClientRect();
      return {
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
        dpr: Math.min(maxDpr, window.devicePixelRatio || 1),
      };
    };
    let last = size();
    const canvas = document.createElement('canvas');
    canvas.className = 'block size-full';
    canvas.width = Math.max(1, Math.round(last.width * last.dpr));
    canvas.height = Math.max(1, Math.round(last.height * last.dpr));
    element.append(canvas);
    const unsubscribe = client.subscribe((message) => onMessage(message));
    client.attach(view, canvas.transferControlToOffscreen(), last, { role });
    attached.current = true;
    const start = initial.current;
    // Pages that keep the loaded design get `ready` from its first frame; a design sent right
    // after loading restarts the wait.
    awaiting.current = 'built';
    client.load(view, templateId, start === undefined ? {} : { state: start });

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = size();
        if (next.width === last.width && next.height === last.height && next.dpr === last.dpr) {
          return;
        }
        last = next;
        client.resize(view, next);
      });
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      client.detach(view);
      attached.current = false;
      canvas.remove();
      awaiting.current = null;
      setLoaded(null);
      setBuilt(null);
      setReady(false);
    };
  }, [client, enabled, view, templateId, role, maxDpr]);

  useEffect(() => {
    if (client && enabled) client.setVisible(view, visible);
  }, [client, enabled, view, visible]);

  const send = (state: DesignState) => {
    if (!client || !attached.current) return;
    awaiting.current = 'built';
    setReady(false);
    client.setState(view, state);
  };

  return { host, client, view, loaded, built, ready, send };
}

/**
 * Whether an element is near the viewport (`near`, within `margin`) and on screen (`visible`).
 * `near` stays true once reached, so views attach once and stay loaded.
 */
export function useInView(
  target: RefObject<Element | null>,
  margin = '50% 0px',
): { near: boolean; visible: boolean } {
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setNear(true);
      },
      { rootMargin: margin },
    );
    const visibleObserver = new IntersectionObserver(([entry]) =>
      setVisible(Boolean(entry?.isIntersecting)),
    );
    nearObserver.observe(element);
    visibleObserver.observe(element);
    return () => {
      nearObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [target, margin]);
  return { near, visible };
}

/** `prefers-reduced-motion: reduce`, live. False on the server and before hydration. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}
