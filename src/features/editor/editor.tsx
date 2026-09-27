'use client';

/**
 * The editor (docs/02-experience.md §6): top bar, stage, transport and inspector around one
 * design. The design lives in the project store (with undo); the render worker draws it on the
 * stage — or a hover preview from the UI store — and reports frames, the timeline and the
 * stage's editable regions back. Templates load through a hidden probe view, which also
 * sanitizes designs from share links and drafts. Image files can be dropped on the stage or
 * pasted; they go to an image field (through the inbox), which reads them like its own.
 */

import { MotionConfig } from 'motion/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { IconButton } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { CheckerIcon, FitIcon, GuidesIcon } from '@/design/icons';
import {
  type Backdrop,
  type Capabilities,
  categoryName,
  type DesignState,
  type Section,
  type SectionName,
  type TemplateDescriptor,
  type TimelineWarning,
  type WorkerMessage,
} from '@/engine/host';
import { createPlayhead } from '@/stores/playhead';
import { createProjectStore } from '@/stores/project';
import { createUiStore } from '@/stores/ui';
import type { TemplateEntry } from '@/templates/registry';
import { useFileDropGuard } from '../assets/file-drag';
import { importFile } from '../assets/import-file';
import { createFileInbox } from '../assets/inbox';
import { usePastedImage } from '../assets/paste';
import { keepPreviewFile } from '../assets/previews';
import { keepFile, useAutosave } from '../drafts/drafts';
import { ExportPanel } from '../export/export-panel';
import { ShareButton } from '../share/share-button';
import { Stage, type StageDropTarget } from '../stage/stage';
import { STEP, Transport } from '../transport/transport';
import { EditorInspector } from './editor-inspector';
import { ShortcutList } from './shortcut-list';
import { StageOverlay } from './stage-overlay';
import { type StartingDesign, startingDesign } from './starting-design';
import { FormatStrip, TopBar } from './top-bar';
import { useRenderClient } from './use-render-client';
import { useShortcuts } from './use-shortcuts';

declare global {
  interface Window {
    /** End-to-end tests: the editor's render client and stores. */
    __ugokiEditor?: {
      project: ReturnType<typeof createProjectStore>;
      ui: ReturnType<typeof createUiStore>;
    };
  }
}

/** A hidden 1 × 1 view that loads the template and sanitizes designs. */
const PROBE = 'probe';
const STAGE = 'stage';

type Timeline = {
  duration: number;
  sections: Readonly<Record<SectionName, Section>>;
  warnings: readonly TimelineWarning[];
  cut: number | null;
};

/** Transitions preview A → B; overlays (transparent by default) preview over footage. */
function defaultBackdrop(template: TemplateDescriptor): Backdrop {
  if (template.structure === 'transition') return { kind: 'scenes' };
  return template.alpha === 'default' ? { kind: 'footage' } : { kind: 'none' };
}

export function Editor({ entry }: { entry: TemplateEntry }) {
  const [project] = useState(() => createProjectStore());
  const [ui] = useState(createUiStore);
  const [playhead] = useState(createPlayhead);
  /** Files dropped on the stage or pasted, on their way to an image field. */
  const [inbox] = useState(createFileInbox);
  const client = useRenderClient();
  const [descriptor, setDescriptor] = useState<TemplateDescriptor | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** The next probe answer resets the design (an undoable change) instead of loading it. */
  const resetting = useRef(false);
  /** How the design was opened (a link, a draft or the template), for the probe's answer. */
  const opening = useRef<StartingDesign | null>(null);

  const design = useStore(project, (s) => s.design);
  const canUndo = useStore(project, (s) => s.canUndo);
  const canRedo = useStore(project, (s) => s.canRedo);
  const preview = useStore(ui, (s) => s.preview);
  const guides = useStore(ui, (s) => s.guides);
  const zoom = useStore(ui, (s) => s.zoom);
  const loop = useStore(ui, (s) => s.loop);
  const backdrop = useStore(ui, (s) => s.backdrop);
  const sheet = useStore(ui, (s) => s.sheet);
  const shown = preview ?? design;

  // The editor is a Cinema screen; the root layout defaults to Daylight.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = 'cinema';
    return () => {
      root.dataset.theme = previous;
    };
  }, []);

  useEffect(() => {
    window.__ugokiEditor = { project, ui };
    return () => {
      delete window.__ugokiEditor;
    };
  }, [project, ui]);

  const onMessage = useEffectEvent((message: WorkerMessage) => {
    switch (message.type) {
      case 'loaded':
        if (message.view !== PROBE) break;
        client?.detach(PROBE);
        if (resetting.current) {
          resetting.current = false;
          project.getState().change(message.state);
          break;
        }
        {
          const start = opening.current;
          setDescriptor(message.template);
          project.getState().load(message.state, {
            name: start?.name ?? entry.name,
            draftId: start?.draftId ?? null,
          });
          const newer =
            start?.linkVersion !== undefined && start.linkVersion > message.template.version;
          const notes = [
            start?.notice,
            newer ? 'It was made with a newer Ugoki, so some settings may have been reset.' : null,
          ].filter(Boolean);
          if (notes.length > 0) setNotice(notes.join(' '));
        }
        ui.getState().setBackdrop(defaultBackdrop(message.template));
        // Open on the template's poster frame, not its empty first frame.
        playhead.set({ t: message.template.poster, playing: false });
        client?.seek(STAGE, message.template.poster);
        break;
      case 'built':
        if (message.view === STAGE) {
          setTimeline({
            duration: message.duration,
            sections: message.sections,
            warnings: message.warnings,
            cut: message.cut,
          });
        }
        break;
      case 'frame':
        // Frames rendered before the latest seek/play/pause would pull the playhead back.
        if (message.view === STAGE && client?.isCurrent(message)) {
          playhead.set({ t: message.t, playing: message.playing });
        }
        break;
      case 'regions':
        if (message.view === STAGE) ui.getState().setRegions(message.regions);
        break;
      case 'capabilities':
        setCapabilities(message.capabilities);
        break;
      case 'error':
        setNotice(
          message.phase === 'load'
            ? `This template couldn’t load: ${message.message}`
            : `Something went wrong drawing the design: ${message.message}`,
        );
        break;
    }
  });

  // Load the design — from a link, a draft or the template — through the probe view.
  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.subscribe((message) => onMessage(message));
    client.probe();
    let cancelled = false;
    void startingDesign(entry).then(async (start) => {
      if (cancelled) return;
      if (start.redirect) {
        window.location.replace(start.redirect);
        return;
      }
      opening.current = start;
      // A draft's files first, so the design never renders with placeholders in their place.
      for (const [hash, file] of start.files) {
        const imported = await importFile(file).catch(() => null);
        if (!imported || cancelled) continue;
        files.current.set(hash, file);
        keepPreviewFile(hash, file);
        client.setAsset(hash, imported.asset);
      }
      if (cancelled) return;
      client.attach(PROBE, new OffscreenCanvas(1, 1), { width: 1, height: 1, dpr: 1 });
      client.load(PROBE, entry.id, start.state === undefined ? {} : { state: start.state });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, entry]);

  // The stage shows the design, or what's being pointed at.
  useEffect(() => {
    if (client && shown) client.setState(STAGE, shown);
  }, [client, shown]);
  useEffect(() => {
    if (client) client.setLoop(STAGE, loop);
  }, [client, loop]);
  useEffect(() => {
    if (client) client.setBackdrop(STAGE, backdrop);
  }, [client, backdrop]);

  /** A fresh stage canvas: send it everything the view needs. */
  const syncStage = () => {
    if (!client) return;
    const current = ui.getState().preview ?? project.getState().design;
    if (current) client.setState(STAGE, current);
    client.setLoop(STAGE, ui.getState().loop);
    client.setBackdrop(STAGE, ui.getState().backdrop);
    const { t, playing } = playhead.get();
    client.seek(STAGE, t);
    if (playing) client.play(STAGE);
  };

  /** The user's files by hash (kept on this device; decoded again for each export). */
  const files = useRef(new Map<string, File>());
  const addFile = async (file: File) => {
    const imported = await importFile(file);
    files.current.set(imported.hash, file);
    client?.setAsset(imported.hash, imported.asset);
    // Kept with the drafts, so the design reopens with it.
    void keepFile(imported.hash, file);
    return imported;
  };

  const { status: saveStatus, flush } = useAutosave({
    project,
    thumbnail: () =>
      client && descriptor ? client.snapshot(STAGE, descriptor.poster, 180) : Promise.resolve(null),
  });

  /** The files a design and its backdrop use, decoded again for the export worker. */
  const exportAssets = async (current: DesignState) => {
    const hashes = new Set<string>();
    for (const value of Object.values(current.props)) {
      const ref = value as { kind?: string; hash?: string } | null;
      if (ref?.kind === 'user' && typeof ref.hash === 'string') hashes.add(ref.hash);
    }
    const { backdrop: behind } = ui.getState();
    if (behind.kind === 'image') hashes.add(behind.hash);
    const assets = [];
    for (const hash of hashes) {
      const file = files.current.get(hash);
      if (file) assets.push({ hash, asset: (await importFile(file)).asset });
    }
    return assets;
  };

  const duration = timeline?.duration ?? 0;
  const play = () => {
    if (!client) return;
    client.play(STAGE);
    const { t } = playhead.get();
    playhead.set({ t: t >= duration ? 0 : t, playing: true });
  };
  const pause = () => {
    client?.pause(STAGE);
    playhead.set({ ...playhead.get(), playing: false });
  };
  const seek = (t: number, scrub: boolean) => {
    client?.seek(STAGE, t, scrub);
    playhead.set({ t, playing: playhead.get().playing });
  };

  const reset = () => {
    if (!client) return;
    resetting.current = true;
    client.attach(PROBE, new OffscreenCanvas(1, 1), { width: 1, height: 1, dpr: 1 });
    client.load(PROBE, entry.id);
  };

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? null : current)), 2400);
  };

  // Image files from outside the inspector: dropped on the stage, or pasted.
  useFileDropGuard();
  const images = Object.entries(descriptor?.controls ?? {}).flatMap(([key, control]) =>
    control.kind === 'image' ? [{ key, label: control.label }] : [],
  );
  /** Hands a file to an image field; a problem also shows under the stage, where it was dropped. */
  const deliver = (control: string, file: File) => {
    const reading = inbox.send(control, file);
    void reading?.then((error) => {
      if (error) flash(error);
    });
    return reading !== null;
  };
  /** The image a file dropped at `at` fills: the one under the pointer, or else the first. */
  const dropTarget = (
    at: { x: number; y: number } | null,
  ): (StageDropTarget & { control: string }) | null => {
    const first = images[0];
    if (!first) return null;
    const onStage = ui
      .getState()
      .regions.filter(
        (r) => r.kind === 'editable' && images.some((image) => image.key === r.target),
      );
    const under = at
      ? onStage
          .filter(
            ({ bounds: b }) => at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h,
          )
          .sort((a, b) => a.bounds.w * a.bounds.h - b.bounds.w * b.bounds.h)[0]
      : undefined;
    const target = images.find((image) => image.key === under?.target) ?? first;
    const region = under ?? onStage.find((r) => r.target === target.key);
    return { control: target.key, label: target.label, bounds: region?.bounds ?? null };
  };
  /** The image a paste fills: the field with focus, the one last worked in, or else the first. */
  const pasteTarget = () => {
    const focused =
      document.activeElement?.closest('[data-image-field]')?.getAttribute('data-image-field') ??
      null;
    const candidates = [focused, inbox.active];
    return (
      candidates.find((key) => images.some((image) => image.key === key)) ?? images[0]?.key ?? null
    );
  };
  usePastedImage(
    design && descriptor && !sheet
      ? (file) => {
          const control = pasteTarget();
          return control !== null && deliver(control, file);
        }
      : null,
  );

  useShortcuts(
    design && descriptor
      ? {
          togglePlay: () => (playhead.get().playing ? pause() : play()),
          step: (delta) => {
            pause();
            const t = Math.round((playhead.get().t + delta) / STEP) * STEP;
            seek(Math.min(duration, Math.max(0, t)), false);
          },
          seek: (to) => seek(to === 'start' ? 0 : duration, false),
          undo: () => project.getState().undo(),
          redo: () => project.getState().redo(),
          exportNow: () => ui.getState().openSheet('export'),
          save: () => void flush().then(() => flash('Saved on this device')),
          format: (format) => project.getState().change({ format }),
          formats: descriptor.formats,
          toggleGuides: () => ui.getState().toggleGuides(),
          toggleLoop: () => ui.getState().setLoop(!ui.getState().loop),
          resetSelected: () => {
            const id = ui.getState().selected;
            if (!id) return;
            project.getState().change((d) => {
              const { [id]: _, ...layout } = d.layout;
              return { ...d, layout };
            });
          },
          escape: () => {
            const state = ui.getState();
            if (state.sheet) state.openSheet(null);
            else if (state.preview) state.setPreview(null);
            else state.select(null);
          },
          shortcuts: () => ui.getState().openSheet('shortcuts'),
          nudge: (x, y) => {
            const id = ui.getState().selected;
            if (!id) return false;
            project.getState().change(
              (d) => {
                const offset = d.layout[id] ?? { x: 0, y: 0, scale: 1 };
                return {
                  ...d,
                  layout: { ...d.layout, [id]: { ...offset, x: offset.x + x, y: offset.y + y } },
                };
              },
              { coalesce: `layout.${id}.nudge` },
            );
            return true;
          },
        }
      : null,
  );

  const transparent = (shown?.transparent ?? false) && backdrop.kind === 'none';
  const names: Record<string, string> = Object.fromEntries(
    Object.entries(descriptor?.controls ?? {}).map(([key, control]) => [key, control.label]),
  );
  const summary = design ? stageSummary(entry.name, descriptor, design) : entry.name;

  return (
    <MotionConfig reducedMotion="user">
      <div data-theme="cinema" className="flex h-dvh flex-col bg-bg text-fg">
        <TopBar
          name={entry.name}
          category={categoryName(entry.category)}
          formats={descriptor?.formats ?? entry.formats}
          format={design?.format ?? null}
          onFormat={(format) => project.getState().change({ format })}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => project.getState().undo()}
          onRedo={() => project.getState().redo()}
          share={
            <ShareButton
              design={() => project.getState().design}
              disabled={!design}
              className="ml-1 hidden sm:inline-flex"
            />
          }
          saveStatus={saveStatus}
          onExport={() => ui.getState().openSheet('export')}
          ready={Boolean(design)}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="flex min-h-[56vh] min-w-0 flex-1 flex-col lg:min-h-0">
            {client && design ? (
              <Stage
                client={client}
                view={STAGE}
                format={shown?.format ?? design.format}
                zoom={zoom}
                checkerboard={transparent}
                guides={guides}
                label={summary}
                onAttach={syncStage}
                drop={{
                  target: dropTarget,
                  onDrop: (file, at) => {
                    const target = dropTarget(at);
                    if (target) deliver(target.control, file);
                  },
                }}
                overlay={(box) => (
                  <StageOverlay
                    box={box}
                    names={names}
                    format={shown?.format ?? design.format}
                    project={project}
                    ui={ui}
                    onGrab={pause}
                  />
                )}
                controls={
                  <>
                    <IconButton
                      label="Safe areas (G)"
                      pressed={guides}
                      onClick={() => ui.getState().toggleGuides()}
                    >
                      <GuidesIcon size={18} />
                    </IconButton>
                    {design.transparent && (
                      <IconButton
                        label={
                          backdrop.kind === 'none'
                            ? 'Show the preview backdrop'
                            : 'Show transparency'
                        }
                        pressed={backdrop.kind === 'none'}
                        onClick={() =>
                          ui
                            .getState()
                            .setBackdrop(
                              backdrop.kind === 'none'
                                ? descriptor
                                  ? defaultBackdrop(descriptor)
                                  : { kind: 'footage' }
                                : { kind: 'none' },
                            )
                        }
                      >
                        <CheckerIcon size={18} />
                      </IconButton>
                    )}
                    <IconButton
                      label={zoom === 'fit' ? 'Actual size (100%)' : 'Fit to the stage'}
                      pressed={zoom === 'actual'}
                      onClick={() => ui.getState().setZoom(zoom === 'fit' ? 'actual' : 'fit')}
                    >
                      <FitIcon size={18} />
                    </IconButton>
                  </>
                }
              />
            ) : (
              <StageLoading />
            )}
            {notice && (
              <div
                role="status"
                className="flex items-center justify-center gap-3 border-line border-t px-4 py-2 text-[13px] text-fg-2"
              >
                <span>{notice}</span>
                <button
                  type="button"
                  className="shrink-0 text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg"
                  onClick={() => setNotice(null)}
                >
                  Dismiss
                </button>
              </div>
            )}
            {design && descriptor && (
              <FormatStrip
                formats={descriptor.formats}
                format={design.format}
                onFormat={(format) => project.getState().change({ format })}
              />
            )}
            <div className="border-line border-t">
              <Transport
                playhead={playhead}
                duration={duration}
                sections={timeline?.sections ?? null}
                cut={timeline?.cut ?? null}
                loop={loop}
                onPlay={play}
                onPause={pause}
                onSeek={seek}
                onLoop={(next) => ui.getState().setLoop(next)}
                {...(design && descriptor && typeof design.duration === 'number'
                  ? {
                      durationHandle: {
                        value: design.duration,
                        min: descriptor.duration.min,
                        max: descriptor.duration.max,
                        onChange: (next: number) =>
                          project.getState().change({ duration: next }, { coalesce: 'duration' }),
                      },
                    }
                  : {})}
              />
            </div>
          </main>

          <aside
            aria-label="Inspector"
            className="shrink-0 border-line bg-bg-2 lg:w-[360px] lg:overflow-y-auto lg:border-l 3xl:w-[400px]"
          >
            {descriptor && design ? (
              <EditorInspector
                descriptor={descriptor}
                design={design}
                project={project}
                ui={ui}
                warnings={timeline?.warnings ?? []}
                length={timeline?.duration ?? null}
                onAddFile={addFile}
                inbox={inbox}
                onReset={reset}
              />
            ) : (
              <p className="px-5 py-5 text-[13px] text-fg-3" aria-live="polite">
                Loading {entry.name}…
              </p>
            )}
          </aside>
        </div>
      </div>
      <Sheet
        open={sheet === 'export' && Boolean(design)}
        onOpenChange={(open) => ui.getState().openSheet(open ? 'export' : null)}
        title="Export"
        description={`${entry.name} · ${design?.format ?? ''} — rendered on this device, nothing is uploaded.`}
      >
        {design && descriptor && (
          <ExportPanel
            eager
            state={design}
            cut={timeline?.cut ?? null}
            transition={descriptor.structure === 'transition'}
            capabilities={capabilities}
            time={() => playhead.get().t}
            backdrop={backdrop}
            assets={() => exportAssets(design)}
          />
        )}
      </Sheet>
      <Sheet
        open={sheet === 'shortcuts'}
        onOpenChange={(open) => ui.getState().openSheet(open ? 'shortcuts' : null)}
        title="Keyboard shortcuts"
      >
        <ShortcutList />
      </Sheet>
    </MotionConfig>
  );
}

/** The stage while the template loads: the Dot, pulsing (docs/02-experience.md §9). */
function StageLoading() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center" aria-live="polite">
      <span className="sr-only">Loading the template…</span>
      <span aria-hidden="true" className="size-3 animate-pulse rounded-full bg-dot" />
    </div>
  );
}

/** A text alternative for the stage: the template and what it says. */
function stageSummary(
  name: string,
  descriptor: TemplateDescriptor | null,
  design: DesignState,
): string {
  const texts = descriptor
    ? Object.entries(descriptor.controls)
        .filter(([, control]) => control.kind === 'text')
        .map(([key]) => design.props[key])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  return texts.length > 0 ? `${name}: ${texts.join(' — ')}` : `${name} preview`;
}
