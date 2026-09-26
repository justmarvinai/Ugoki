'use client';

/**
 * The Lab (docs/06-engine.md §14): the template workbench. Every format side by side, one
 * transport for all, energies, durations, stress text, palettes incl. brand colors, safe areas,
 * a render-cost meter and PNG stills. `?worker=0` renders on the main thread for debugging.
 */

import { MotionConfig } from 'motion/react';
import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Wordmark } from '@/components/wordmark';
import {
  type Capabilities,
  type DesignState,
  FORMATS,
  type FormatId,
  type QualityMode,
  RenderClient,
  type Section,
  type SectionName,
  type TemplateDescriptor,
  type TimelineWarning,
  type WorkerMessage,
} from '@/engine/host';
import { TEMPLATES } from '@/templates/registry';
import { createRenderEndpoint } from '@/workers';
import { type Focus, Inspector } from './inspector';
import { LabView } from './lab-view';
import { createPlayhead, createStats } from './stores';
import { STEP, Transport } from './transport';

declare global {
  interface Window {
    /** Lab debugging and end-to-end tests: the live render client. */
    __ugokiLab?: { client: RenderClient };
  }
}

/** A hidden 1 × 1 view used to load templates and sanitize states. */
const PROBE = 'probe';
const GAP = 24;
const CAPTION = 28;

type Timeline = {
  duration: number;
  sections: Readonly<Record<SectionName, Section>>;
  warnings: readonly TimelineWarning[];
};

type Arrangement = { rows: FormatId[][]; height: number } | { stack: true; width: number };

/** Largest frame height for which the views fit the stage, in one row or two. */
function arrange(formats: readonly FormatId[], width: number, height: number): Arrangement {
  if (width < 640) return { stack: true, width };
  const aspect = (row: readonly FormatId[]) => row.reduce((sum, f) => sum + FORMATS[f].aspect, 0);
  const fitRows = (rows: FormatId[][]) => {
    const widest = Math.max(...rows.map((row) => aspect(row)));
    const gaps = Math.max(...rows.map((row) => (row.length - 1) * GAP));
    const byWidth = (width - gaps) / widest;
    const byHeight = (height - (rows.length - 1) * GAP) / rows.length - CAPTION;
    return { rows, height: Math.max(40, Math.min(byWidth, byHeight)) };
  };
  const single = fitRows([[...formats]]);
  if (formats.length < 3) return single;
  // Two rows balanced by total aspect ratio (widest formats first).
  const rows: FormatId[][] = [[], []];
  for (const f of [...formats].sort((a, b) => FORMATS[b].aspect - FORMATS[a].aspect)) {
    const [a, b] = rows as [FormatId[], FormatId[]];
    (aspect(a) <= aspect(b) ? a : b).push(f);
  }
  const double = fitRows(rows.map((row) => formats.filter((f) => row.includes(f))));
  return double.height > single.height ? double : single;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Lab() {
  const [client, setClient] = useState<RenderClient | null>(null);
  const [inline, setInline] = useState(false);
  const [templateId, setTemplateId] = useState(TEMPLATES[0]?.id ?? 'rise');
  const [descriptor, setDescriptor] = useState<TemplateDescriptor | null>(null);
  const [state, setState] = useState<DesignState | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [focus, setFocus] = useState<Focus>('all');
  const [guides, setGuides] = useState(false);
  const [quality, setQuality] = useState<QualityMode>('adaptive');
  const [loop, setLoop] = useState(true);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [playhead] = useState(createPlayhead);
  const [stats] = useState(createStats);
  const stage = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const views = useMemo(
    () => (descriptor?.formats ?? []).filter((f) => focus === 'all' || f === focus),
    [descriptor, focus],
  );
  const primary = views[0] ?? null;

  // The Lab is a Cinema screen; the root layout defaults to Daylight.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = 'cinema';
    return () => {
      root.dataset.theme = previous;
    };
  }, []);

  // Render worker lifecycle.
  useEffect(() => {
    let disposed = false;
    let instance: RenderClient | null = null;
    const useInline = new URLSearchParams(window.location.search).get('worker') === '0';
    setInline(useInline);
    void createRenderEndpoint({ inline: useInline }).then((endpoint) => {
      if (disposed) {
        endpoint.terminate();
        return;
      }
      instance = new RenderClient(endpoint);
      setClient(instance);
    });
    return () => {
      disposed = true;
      instance?.dispose();
      setClient(null);
    };
  }, []);

  const onMessage = useEffectEvent((message: WorkerMessage) => {
    switch (message.type) {
      case 'loaded':
        if (message.view === PROBE) {
          client?.detach(PROBE);
          setDescriptor(message.template);
          setState(message.state);
          setFocus((current) =>
            current === 'all' || message.template.formats.includes(current) ? current : 'all',
          );
        }
        break;
      case 'built':
        if (message.view === primary) {
          setTimeline({
            duration: message.duration,
            sections: message.sections,
            warnings: message.warnings,
          });
        }
        break;
      case 'frame':
        stats.record(message);
        if (message.view === primary) playhead.set({ t: message.t, playing: message.playing });
        break;
      case 'capabilities':
        setCapabilities(message.capabilities);
        break;
      case 'error':
        setErrors((list) => [
          ...list.slice(-3),
          `${message.view ?? 'worker'} · ${message.phase}: ${message.message}`,
        ]);
        break;
    }
  });

  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.subscribe((message) => onMessage(message));
    client.probe();
    window.__ugokiLab = { client };
    return () => {
      unsubscribe();
      delete window.__ugokiLab;
    };
  }, [client]);

  // Templates load through the probe view, which also sanitizes raw states (JSON edits).
  useEffect(() => {
    if (!client) return;
    client.attach(PROBE, new OffscreenCanvas(1, 1), { width: 1, height: 1, dpr: 1 });
    client.load(PROBE, templateId);
  }, [client, templateId]);

  const applyJson = (raw: unknown) => {
    if (!client) return;
    client.attach(PROBE, new OffscreenCanvas(1, 1), { width: 1, height: 1, dpr: 1 });
    client.load(PROBE, templateId, { state: raw });
  };

  // Every view renders the same design in its own format.
  useEffect(() => {
    if (!client || !state) return;
    for (const format of views) client.setState(format, { ...state, format });
  }, [client, state, views]);

  // Views that (re)attach join the shared transport at the current time.
  const syncTransport = useEffectEvent((targets: readonly FormatId[]) => {
    if (!client || targets.length === 0) return;
    const { t, playing } = playhead.get();
    client.seek(targets, t);
    if (playing) client.play(targets);
  });

  useEffect(() => {
    if (client) syncTransport(views);
  }, [client, views]);

  useEffect(() => {
    if (client && views.length > 0) client.setLoop(views, loop);
  }, [client, views, loop]);

  useEffect(() => {
    if (client && views.length > 0) client.setQuality(views, quality);
  }, [client, views, quality]);

  // Stage size → view layout. Measured before the first paint, so views never mount at 0 × 0
  // (their canvases would be handed to the worker at a zero size and resized afterwards).
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      setStageSize({
        width: Math.max(0, element.clientWidth - padX),
        height: Math.max(0, element.clientHeight - padY),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const duration = timeline?.duration ?? 0;
  const play = () => {
    if (!client) return;
    client.play(views);
    playhead.set({ t: playhead.get().t >= duration ? 0 : playhead.get().t, playing: true });
  };
  const pause = () => {
    client?.pause(views);
    playhead.set({ ...playhead.get(), playing: false });
  };
  const seek = (t: number, scrub: boolean) => {
    client?.seek(views, t, scrub);
    playhead.set({ t, playing: playhead.get().playing });
  };

  const capture = async () => {
    if (!client) return;
    const { t } = playhead.get();
    for (const format of views) {
      try {
        const blob = await client.snapshot(format, t, 1080);
        download(blob, `ugoki-${templateId}-${format.replace(':', 'x')}-${t.toFixed(2)}s.png`);
      } catch (error) {
        setErrors((list) => [...list.slice(-3), `capture ${format}: ${String(error)}`]);
      }
    }
  };

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) {
      return;
    }
    const { t, playing } = playhead.get();
    const stepBy = (delta: number) => {
      pause();
      seek(Math.min(duration, Math.max(0, Math.round((t + delta) / STEP) * STEP)), false);
    };
    switch (event.key) {
      case ' ':
        if (target?.closest('button')) return;
        event.preventDefault();
        if (playing) pause();
        else play();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        stepBy(event.shiftKey ? -1 : -STEP);
        break;
      case 'ArrowRight':
        event.preventDefault();
        stepBy(event.shiftKey ? 1 : STEP);
        break;
      case 'Home':
        seek(0, false);
        break;
      case 'End':
        seek(duration, false);
        break;
      case 'l':
      case 'L':
        setLoop((value) => !value);
        break;
      case 'g':
      case 'G':
        setGuides((value) => !value);
        break;
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const layout = arrange(views, stageSize.width, stageSize.height);

  return (
    <MotionConfig reducedMotion="user">
      <div data-theme="cinema" className="flex min-h-dvh flex-col bg-bg text-fg lg:h-dvh">
        <header className="flex h-14 shrink-0 items-center gap-4 border-line border-b px-4 md:px-6">
          <Wordmark className="text-[20px]" />
          <span className="text-[13px] text-fg-3">Lab</span>
          <label className="sr-only" htmlFor="lab-template">
            Template
          </label>
          <select
            id="lab-template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            className="h-8 rounded-md border border-line bg-bg-3 px-2 text-[13px] font-[550] text-fg"
          >
            {TEMPLATES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} — {entry.tagline}
              </option>
            ))}
          </select>
          <span className="ml-auto hidden text-[12px] text-fg-3 sm:inline">
            {inline ? 'Main thread' : 'Render worker'} · {views.length}{' '}
            {views.length === 1 ? 'view' : 'views'}
          </span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={stage} className="min-h-[50vh] flex-1 overflow-auto p-4 md:p-6">
              {client && descriptor && stageSize.width > 0 && (
                <div className="flex min-h-full flex-col items-center justify-center gap-6">
                  {'stack' in layout
                    ? views.map((format) => (
                        <LabView
                          key={format}
                          client={client}
                          format={format}
                          height={layout.width / FORMATS[format].aspect}
                          transparent={state?.transparent ?? false}
                          guides={guides}
                          stats={stats}
                        />
                      ))
                    : layout.rows.map((row) => (
                        <div key={row.join()} className="flex items-end justify-center gap-6">
                          {row.map((format) => (
                            <LabView
                              key={format}
                              client={client}
                              format={format}
                              height={layout.height}
                              transparent={state?.transparent ?? false}
                              guides={guides}
                              stats={stats}
                            />
                          ))}
                        </div>
                      ))}
                </div>
              )}
            </div>
            {errors.length > 0 && (
              <div
                role="alert"
                className="flex items-start justify-between gap-4 border-line border-t px-4 py-2 font-mono text-[12px] text-danger md:px-6"
              >
                <ul>
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-fg-3 hover:text-fg"
                  onClick={() => setErrors([])}
                >
                  Clear
                </button>
              </div>
            )}
            <div className="border-line border-t">
              <Transport
                playhead={playhead}
                duration={duration}
                sections={timeline?.sections ?? null}
                loop={loop}
                onPlay={play}
                onPause={pause}
                onSeek={seek}
                onLoop={setLoop}
              />
            </div>
          </main>

          <aside className="shrink-0 border-line bg-bg-2 lg:w-[380px] lg:overflow-y-auto lg:border-l 3xl:w-[420px]">
            {descriptor && state ? (
              <Inspector
                descriptor={descriptor}
                state={state}
                onChange={setState}
                warnings={timeline?.warnings ?? []}
                focus={focus}
                onFocus={setFocus}
                guides={guides}
                onGuides={setGuides}
                quality={quality}
                onQuality={setQuality}
                onCapture={() => void capture()}
                onApplyJson={applyJson}
                capabilities={capabilities}
                inline={inline}
              />
            ) : (
              <p className="px-5 py-5 text-[13px] text-fg-3" aria-live="polite">
                Loading the engine…
              </p>
            )}
          </aside>
        </div>
      </div>
    </MotionConfig>
  );
}
