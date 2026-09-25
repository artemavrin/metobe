// Edge shapes for the «· срез» brand panel. Each is an SVG path in a 100×100 box stretched to the panel
// (preserveAspectRatio="none"), used as a mask, so straight and curved edges scale with any screen.
// `bottom` is where the edge meets the bottom (in % of the panel width): the tagline starts after it.
export const CUTS = {
  diagonal: { bottom: 0, label: "диагональ", path: "M22 0H100V100H0Z" },
  gentle: { bottom: 0, label: "пологая", path: "M10 0H100V100H0Z" },
  steep: { bottom: 0, label: "крутая", path: "M40 0H100V100H0Z" },
  chevron: { bottom: 16, label: "шеврон", path: "M16 0H100V100H16L0 50Z" },
  arc: { bottom: 24, label: "дуга", path: "M24 0H100V100H24Q-8 50 24 0Z" },
  concave: { bottom: 0, label: "вогнутая", path: "M0 0H100V100H0Q30 50 0 0Z" },
  wave: { bottom: 6, label: "волна", path: "M16 0C0 30 28 62 6 100H100V0Z" },
} as const;

export type Cut = keyof typeof CUTS;

export const cutMask = (cut: Cut) => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${CUTS[cut].path}'/></svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  return {
    maskImage: url,
    maskRepeat: "no-repeat",
    maskSize: "100% 100%",
    WebkitMaskImage: url,
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "100% 100%",
  } satisfies React.CSSProperties;
};
