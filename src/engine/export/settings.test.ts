import { describe, expect, it } from 'vitest';
import {
  cutFrame,
  type ExportSettings,
  exportFileName,
  exportSize,
  formatAvailability,
  frameCount,
  motionSamples,
  videoBitrate,
} from './settings';

const settings = (patch: Partial<ExportSettings> = {}): ExportSettings => ({
  format: 'mp4',
  resolution: 1080,
  fps: 30,
  quality: 'high',
  ...patch,
});

describe('export settings', () => {
  it('sizes frames by short side, evenly, and GIFs by width', () => {
    expect(exportSize('16:9', settings())).toEqual({ width: 1920, height: 1080 });
    expect(exportSize('9:16', settings({ resolution: 2160 }))).toEqual({
      width: 2160,
      height: 3840,
    });
    expect(exportSize('4:5', settings({ resolution: 720 }))).toEqual({ width: 720, height: 900 });
    expect(exportSize('16:9', settings({ format: 'gif', resolution: 640 }))).toEqual({
      width: 640,
      height: 360,
    });
    expect(exportSize('4:5', settings({ format: 'gif', resolution: 481 }))).toEqual({
      width: 482,
      height: 602,
    });
  });

  it('counts frames from 0 up to (not including) the end', () => {
    expect(frameCount(5, 30)).toBe(150);
    expect(frameCount(1.2, 24)).toBe(29);
    expect(frameCount(0.001, 30)).toBe(1);
    expect(cutFrame(0.6, 30)).toBe(18);
    expect(cutFrame(0.6, 24)).toBe(14);
  });

  it('picks bitrates from the table, between 30 and 60 fps', () => {
    expect(videoBitrate(1080, 30, 'standard')).toBe(10_000_000);
    expect(videoBitrate(1080, 60, 'max')).toBe(36_000_000);
    expect(videoBitrate(2160, 24, 'high')).toBe(50_000_000);
    expect(videoBitrate(720, 50, 'standard')).toBe(7_000_000);
    // Odd sizes use the nearest row.
    expect(videoBitrate(1350, 30, 'high')).toBe(24_000_000);
  });

  it('blurs motion by quality, never in GIFs and stills', () => {
    expect(motionSamples(settings({ quality: 'standard' }))).toBe(4);
    expect(motionSamples(settings({ quality: 'high' }))).toBe(8);
    expect(motionSamples(settings({ format: 'webm', quality: 'max' }))).toBe(16);
    expect(motionSamples(settings({ format: 'gif', quality: 'max' }))).toBe(1);
    expect(motionSamples(settings({ format: 'still', quality: 'max' }))).toBe(1);
  });

  it('names files with size, frame rate and the cut frame', () => {
    const size = { width: 1920, height: 1080 };
    expect(exportFileName({ templateId: 'rise', settings: settings(), size, cut: null })).toBe(
      'ugoki-rise-1920x1080-30fps.mp4',
    );
    expect(
      exportFileName({
        templateId: 'layers',
        settings: settings({ format: 'webm' }),
        size,
        cut: 0.6,
      }),
    ).toBe('ugoki-layers-1920x1080-30fps-cut-f18.webm');
    expect(
      exportFileName({
        templateId: 'line',
        settings: settings({ format: 'png-zip', fps: 25 }),
        size,
        cut: null,
      }),
    ).toBe('ugoki-line-1920x1080-25fps.zip');
    expect(
      exportFileName({
        templateId: 'sheen',
        settings: settings({ format: 'still', time: 2.6 }),
        size,
        cut: null,
      }),
    ).toBe('ugoki-sheen-1920x1080-2.60s.png');
  });

  it('explains formats this browser can’t make', () => {
    const none = { avc: false, vp9: false, vp9Alpha: false, av1: false };
    const vp9Only = { ...none, vp9: true };
    expect(formatAvailability('mp4', { ...none, avc: true })).toEqual({ available: true });
    expect(formatAvailability('mp4', vp9Only)).toEqual({
      available: false,
      reason: 'Your browser can’t encode MP4. WebM works here.',
    });
    expect(formatAvailability('webm', none).available).toBe(false);
    // Transparent designs need transparent WebM to work, opaque ones only VP9.
    expect(formatAvailability('webm', vp9Only)).toEqual({ available: true });
    expect(formatAvailability('webm', vp9Only, { alpha: true })).toEqual({
      available: false,
      reason: 'Your browser can’t keep transparency in WebM. PNG sequences keep it everywhere.',
    });
    expect(formatAvailability('webm', { ...vp9Only, vp9Alpha: true }, { alpha: true })).toEqual({
      available: true,
    });
    for (const format of ['png-zip', 'gif', 'still'] as const) {
      expect(formatAvailability(format, null)).toEqual({ available: true });
    }
  });
});
