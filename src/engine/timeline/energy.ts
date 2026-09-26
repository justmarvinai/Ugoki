/**
 * Energy — the one motion control users need (docs/04-motion-language.md §4).
 * Calm is not "slow Balanced" and Punchy is not "fast Balanced": each profile changes
 * character (curves, overshoot, travel, blur), not just speed.
 */

import type { EaseName } from '../core/easing';
import type { SpringName } from '../core/spring';

export const ENERGY_IDS = ['calm', 'balanced', 'punchy'] as const;
export type EnergyId = (typeof ENERGY_IDS)[number];

export type EnergyProfile = {
  id: EnergyId;
  label: string;
  /** Multiplier for in/out durations and delays. */
  time: number;
  /** Multiplier for stagger gaps. */
  stagger: number;
  /** Multiplier for travel distances. */
  travel: number;
  /** 0 = none, 1 = subtle, 2 = pronounced (≤ 15%). */
  overshoot: 0 | 1 | 2;
  /** Preferred entrance curve. */
  enter: EaseName;
  /** Preferred move/wipe curve. */
  move: EaseName;
  /** Spring used for physical entrances. */
  spring: SpringName;
  /** Motion-blur shutter angle in degrees. */
  shutter: number;
  /** Multiplier for blur-in amounts. */
  blur: number;
};

export const ENERGIES: Record<EnergyId, EnergyProfile> = {
  calm: {
    id: 'calm',
    label: 'Calm',
    time: 1.35,
    stagger: 1.4,
    travel: 0.6,
    overshoot: 0,
    enter: 'glide',
    move: 'drift',
    spring: 'gentle',
    shutter: 90,
    blur: 1.2,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    time: 1,
    stagger: 1,
    travel: 1,
    overshoot: 1,
    enter: 'glide',
    move: 'snap',
    spring: 'snappy',
    shutter: 180,
    blur: 1,
  },
  punchy: {
    id: 'punchy',
    label: 'Punchy',
    time: 0.75,
    stagger: 0.7,
    travel: 1.35,
    overshoot: 2,
    enter: 'snap',
    move: 'snap',
    spring: 'lively',
    shutter: 270,
    blur: 0.8,
  },
};

export function isEnergyId(value: unknown): value is EnergyId {
  return typeof value === 'string' && (ENERGY_IDS as readonly string[]).includes(value);
}
