/**
 * UI motion tokens (docs/03-design-system.md §9) for Motion (`motion/react`). The springs are
 * the engine's named springs, so the interface moves like the templates do.
 */

import { SPRINGS } from '@/engine/core/spring';

const spring = (name: keyof typeof SPRINGS) => ({ type: 'spring' as const, ...SPRINGS[name] });

export const uiSpring = {
  snappy: spring('snappy'),
  gentle: spring('gentle'),
} as const;
