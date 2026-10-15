export interface HeaderScrollState {
  readonly lastY: number;
  readonly travel: number;
  readonly hidden: boolean;
}

export function initialHeaderScroll(y = 0): HeaderScrollState {
  return { lastY: Math.max(0, y), travel: 0, hidden: false };
}

export function updateHeaderScroll(
  state: HeaderScrollState,
  scrollY: number,
  headerHeight: number,
  pinned = false,
): HeaderScrollState {
  const y = Math.max(0, scrollY);
  if (pinned || y <= 12) return initialHeaderScroll(y);

  const delta = y - state.lastY;
  if (!delta) return state;

  const travel = Math.max(
    -16,
    Math.min(
      32,
      Math.sign(delta) === Math.sign(state.travel)
        ? state.travel + delta
        : delta,
    ),
  );
  const hidden =
    travel <= -16
      ? false
      : travel >= 32 && y > headerHeight + 16
        ? true
        : state.hidden;

  return { lastY: y, travel: hidden === state.hidden ? travel : 0, hidden };
}
