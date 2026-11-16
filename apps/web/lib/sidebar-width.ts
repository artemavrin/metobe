// The sidebar's width, as the person drags it (P1 «Режимы»): kept in a cookie, so the server draws the sidebar at its
// width at once — a width read in the browser would jump on load. Per browser, not per account.

/** 16rem: what the sidebar was before it could be dragged. */
export const SIDEBAR_DEFAULT = 256;
export const SIDEBAR_MIN = 224;
export const SIDEBAR_MAX = 480;

export const clampSidebarWidth = (px: number) =>
  Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));

/** A cookie's value as a width; anything but a number is «not set» (the default). */
export const parseSidebarWidth = (value?: string | null) => {
  const px = Number(value);
  return value && Number.isFinite(px) && px > 0 ? clampSidebarWidth(px) : null;
};
