/**
 * Ugoki UI Kit (docs/06-engine.md, docs/templates/10-ui-motion.md): cards, inputs, buttons,
 * toasts, charts, a cursor, app screens and devices, notifications, and the motion helpers of
 * real interfaces (inertial scroll, coupled springs, streaming text, frosted panels), drawn with
 * the Draw API for UI-motion templates.
 *
 * A template creates the kit in `build` — `createUiKit({ text: ctx.text, palette: ctx.palette,
 * mode, unit })`, where `unit` is how many design units one UI px is — lays out components
 * once, and draws them in `render` from state values (0..1 amounts, times).
 */

export {
  BarChart,
  type BarChartOptions,
  CategoryAxis,
  type CategoryAxisOptions,
  chartDomain,
  type Domain,
  Donut as DonutChart,
  type DonutOptions,
  LineChart,
  type LineChartOptions,
  ValueAxis,
  type ValueAxisOptions,
} from './charts';
export {
  Avatar as UiAvatar,
  type AvatarOptions,
  Button as UiButton,
  type ButtonOptions,
  type ButtonState,
  Card as UiCard,
  type CardOptions,
  Field as UiField,
  type FieldOptions,
  type FieldState,
  Row as UiRow,
  type RowOptions,
  Toast as UiToast,
  type ToastOptions,
  Tooltip as UiTooltip,
  type TooltipOptions,
} from './components';
export {
  createUiKit,
  UI_FONT,
  UI_TYPE,
  UiKit,
  type UiKitOptions,
  type UiTextOptions,
  type UiTypeRole,
} from './context';
export {
  type CursorDrawOptions,
  type CursorKind,
  type CursorMove,
  CursorPath,
  type CursorState,
  drawCursor,
} from './cursor';
export {
  minimumJerk,
  minimumJerkVelocity,
  monotoneAt,
  monotonePath,
  monotoneTangents,
  niceTicks,
  PathSampler,
  type Ticks,
} from './curves';
export { createPhone, PHONE_FINISHES, Phone, type PhoneFinish, type PhoneOptions } from './device';
export {
  type Backdrop,
  drawGlass,
  FrostedPanel,
  type FrostOptions,
  frostBackdrop,
} from './frosted';
export {
  type FlickOptions,
  type FlickTiming,
  InertialScroll,
  SpringChain,
  type SpringChainOptions,
  type SpringRange,
  StretchTrack,
  springRange,
} from './motion';
export {
  type AppIcon,
  LockClock,
  type LockClockOptions,
  Notification as UiNotification,
  type NotificationOptions,
} from './notification';
export {
  createScreen,
  SCREEN_HEIGHT,
  SCREEN_KINDS,
  SCREEN_WIDTH,
  Screen,
  type ScreenAnchor,
  type ScreenKind,
  type ScreenOptions,
} from './screens';
export {
  arcPath,
  BoxShadow,
  circlePath,
  drawIcon,
  ICONS,
  type Icon,
  type IconName,
  morphRect,
  phi,
  roundRectPath,
  roundRectPathReverse,
} from './shape';
export {
  type CaretState,
  StreamingText,
  type StreamingTextOptions,
  type StreamOptions,
  streamSchedule,
  streamTokens,
} from './stream';
export {
  ELEVATIONS,
  type Elevation,
  iconColors,
  onFill,
  pickAccent,
  type ShadowLayer,
  UI_RADIUS,
  type UiMode,
  type UiRadius,
  type UiTheme,
  uiTheme,
} from './theme';
export {
  caretOpacity,
  type Typed,
  type TypingOptions,
  typedCount,
  typedFigure,
  typedText,
  typingSchedule,
} from './typing';
