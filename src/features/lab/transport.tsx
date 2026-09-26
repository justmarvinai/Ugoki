'use client';

/**
 * Lab transport: play/pause, frame stepping, loop, timecode and a scrubber showing the
 * timeline's sections (lead · in · hold · out · tail). The Dot is the playhead.
 */

import { useSyncExternalStore } from 'react';
import { IconButton } from '@/components/button';
import { Slider } from '@/components/slider';
import { LoopIcon, PauseIcon, PlayIcon, StepBackIcon, StepForwardIcon } from '@/design/icons';
import type { Section, SectionName } from '@/engine/host';
import type { PlayheadStore } from './stores';

export const STEP = 1 / 30;

type TransportProps = {
  playhead: PlayheadStore;
  duration: number;
  sections: Readonly<Record<SectionName, Section>> | null;
  loop: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (t: number, scrub: boolean) => void;
  onLoop: (loop: boolean) => void;
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
  loop,
  onPlay,
  onPause,
  onSeek,
  onLoop,
}: TransportProps) {
  const { t, playing } = useSyncExternalStore(playhead.subscribe, playhead.get, playhead.get);
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
        <IconButton label="Previous frame (←)" onClick={() => step(-STEP)}>
          <StepBackIcon size={18} />
        </IconButton>
        <IconButton label="Next frame (→)" onClick={() => step(STEP)}>
          <StepForwardIcon size={18} />
        </IconButton>
        <IconButton label="Loop (L)" pressed={loop} onClick={() => onLoop(!loop)}>
          <LoopIcon size={18} />
        </IconButton>
      </div>

      <output aria-label="Time" className="shrink-0 font-mono text-[13px] text-fg-2 tabular-nums">
        <span className="text-fg">{timecode(t)}</span> / {timecode(duration)}
        <span className="ml-3 text-fg-3">f{Math.round(t / STEP)}</span>
      </output>

      <div className="order-last w-full min-w-0 md:order-none md:flex-1">
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
              </span>
            )
          }
        />
      </div>
    </div>
  );
}
