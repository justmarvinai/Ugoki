/**
 * Ugoki UI Kit v1 (docs/06-engine.md, docs/templates/10-ui-motion.md): cards, inputs, buttons,
 * toasts, charts and a cursor, drawn with the Draw API in `u` for UI-motion templates.
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
export {
  BoxShadow,
  circlePath,
  drawIcon,
  ICONS,
  type Icon,
  type IconName,
  morphRect,
  phi,
  roundRectPath,
} from './shape';
export {
  ELEVATIONS,
  type Elevation,
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
