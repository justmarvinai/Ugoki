'use client';

/**
 * Transport (docs/02-experience.md §6): play/pause, timecode, a scrubber tinted with the
 * timeline's sections (lead · in · hold · out · tail) and a transition's cut point, loop, and —
 * in the editor — a duration handle at the scrubber's end (the hold stretches). The Dot is the
 * playhead. The Lab adds frame stepping and a frame counter.
 */

import { type KeyboardEvent, type RefObject, useRef, useSyncExternalStore } from 'react';
import { IconButton } from '@/components/button';
import { Slider } from '@/components/slider';
import { LoopIcon, PauseIcon, PlayIcon, StepBackIcon, StepForwardIcon } from '@/design/icons';
import type { Section, SectionName } from '@/engine/host';
import type { PlayheadStore } from '@/stores/playhead';

/** One frame at 30 fps: arrow keys and the step buttons move by this. */
export const STEP = 1 / 30;

export type DurationHandle = {
  value: number;
  min: number;
  max: number;
  /** A new duration while dragging or stepping. */
  onChange: (duration: number) => void;
};

type TransportProps = {
  playhead: PlayheadStore;
  duration: number;
  sections: Readonly<Record<SectionName, Section>> | null;
  /** Transitions: the frame of full coverage (seconds). */
  cut: number | null;
  loop: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number, scrub: boolean) => void;
  onLoop: (loop: boolean) => void;
  /** Frame stepping and the frame counter (the Lab). */
  frames?: boolean;
  durationHandle?: DurationHandle;
};

const SECTION_TONES: Record<SectionName, string> = {
  lead: 'bg-transparent',
  in: 'bg-fg/25',
  hold: 'bg-fg/10',
  out: 'bg-fg/25',
  tail: 'bg-transparent',
};

export function timecode(t: number): string {
  const safe = Math.max(0, t);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}

export function Transport({
  playhead,
  duration,
  sections,
  cut,
  loop,
  onPlay,
  onPause,
  onSeek,
  onLoop,
  frames = false,
  durationHandle,
}: TransportProps) {
  const { t, playing } = useSyncExternalStore(playhead.subscribe, playhead.get, playhead.get);
  const track = useRef<HTMLDivElement>(null);
  const step = (delta: number) => {
    onPause();
    onSeek(Math.min(duration, Math.max(0, Math.round((t + delta) / STEP) * STEP)), false);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:flex-nowrap md:px-6">
      <div className="flex items-center gap-1">
        <IconButton
          label={playing ? 'Pause (Space)' : 'Play (Space)'}
          onClick={playing ? onPause : onPlay}
          className="text-fg"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        {frames && (
          <>
            <IconButton label="Previous frame (←)" onClick={() => step(-STEP)}>
              <StepBackIcon size={18} />
            </IconButton>
            <IconButton label="Next frame (→)" onClick={() => step(STEP)}>
              <StepForwardIcon size={18} />
            </IconButton>
          </>
        )}
        <IconButton label="Loop (L)" pressed={loop} onClick={() => onLoop(!loop)}>
          <LoopIcon size={18} />
        </IconButton>
      </div>

      <output aria-label="Time" className="shrink-0 font-mono text-[13px] text-fg-2 tabular-nums">
        <span className="text-fg">{timecode(t)}</span> / {timecode(duration)}
        {frames && <span className="ml-3 text-fg-3">f{Math.round(t / STEP)}</span>}
        {frames && cut !== null && (
          <span className="ml-3 text-fg-3">cut f{Math.round(cut / STEP)}</span>
        )}
      </output>

      <div className="order-last flex w-full min-w-0 items-center gap-2 md:order-none md:flex-1">
        <div ref={track} className="min-w-0 flex-1">
          <Slider
            label="Playhead"
            value={Math.min(t, duration)}
            min={0}
            max={Math.max(duration, STEP)}
            step={STEP / 2}
            format={timecode}
            onValueChange={(next) => onSeek(next, true)}
            onValueCommitted={(next) => onSeek(next, false)}
            indicatorClassName="bg-fg/30"
            thumbClassName="size-3.5 bg-dot"
            track={
              sections &&
              duration > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 flex overflow-hidden rounded-full"
                >
                  {(Object.keys(sections) as SectionName[]).map((name) => {
                    const section = sections[name];
                    const width = ((section.end - section.start) / duration) * 100;
                    return width > 0 ? (
                      <span
                        key={name}
                        title={name}
                        className={SECTION_TONES[name]}
                        style={{ width: `${width}%` }}
                      />
                    ) : null;
                  })}
                  {cut !== null && (
                    <span
                      title={`Cut point · ${timecode(cut)}`}
                      className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg"
                      style={{ left: `${(cut / duration) * 100}%` }}
                    />
                  )}
                </span>
              )
            }
          />
        </div>
        {durationHandle && <DurationGrip handle={durationHandle} track={track} />}
      </div>
    </div>
  );
}

/** Snaps durations to tenths of a second within the template's range. */
const snap = (value: number, handle: DurationHandle) =>
  Math.min(handle.max, Math.max(handle.min, Math.round(value * 10) / 10));

/**
 * The duration handle: drag sideways at the scrubber's scale (a second is as wide as a second
 * of the scrubber when the drag began), or use the arrow keys (±0.5 s; Shift ±0.1 s).
 */
function DurationGrip({
  handle,
  track,
}: {
  handle: DurationHandle;
  track: RefObject<HTMLDivElement | null>;
}) {
  const drag = useRef<{ x: number; start: number; perSecond: number } | null>(null);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const by = event.shiftKey ? 0.1 : 0.5;
    const next: Record<string, number> = {
      ArrowRight: handle.value + by,
      ArrowUp: handle.value + by,
      ArrowLeft: handle.value - by,
      ArrowDown: handle.value - by,
      Home: handle.min,
      End: handle.max,
    };
    const value = next[event.key];
    if (value === undefined) return;
    event.preventDefault();
    handle.onChange(snap(value, handle));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Duration"
      aria-valuemin={handle.min}
      aria-valuemax={handle.max}
      aria-valuenow={handle.value}
      aria-valuetext={`${handle.value.toFixed(1)} seconds`}
      title="Drag to change the duration"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        const width = track.current?.clientWidth ?? 320;
        drag.current = {
          x: event.clientX,
          start: handle.value,
          perSecond: width / Math.max(handle.value, 0.1),
        };
      }}
      onPointerMove={(event) => {
        const d = drag.current;
        if (d) handle.onChange(snap(d.start + (event.clientX - d.x) / d.perSecond, handle));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={onKeyDown}
      className="flex h-7 shrink-0 cursor-ew-resize touch-none items-center gap-1.5 rounded-full border border-line-strong px-2.5 font-mono text-[12px] text-fg tabular-nums select-none hover:bg-bg-3 focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-fg-3" />
      {handle.value.toFixed(1)} s
    </div>
  );
}
