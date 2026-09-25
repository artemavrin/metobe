// Brand clips for the sign-in panel (apps/web/public/login): VP9 WebM, 4:5, 8 s loops, no audio; the poster is
// each clip's first frame. Everyone in them faces left — toward the form.
export type BrandVideo = { src: string; poster: string; label: string };

export const BRAND_VIDEOS: BrandVideo[] = [
  { label: "отец на кухне", poster: "/login/brand-1.webp", src: "/login/brand-1.webm" },
  { label: "студент", poster: "/login/brand-2.webp", src: "/login/brand-2.webm" },
  { label: "владелица кафе", poster: "/login/brand-3.webp", src: "/login/brand-3.webm" },
  { label: "руководитель", poster: "/login/brand-4.webp", src: "/login/brand-4.webm" },
];
