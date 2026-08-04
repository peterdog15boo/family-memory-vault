/**
 * Original landing hero frames — warm family / memory photography.
 * Swap files in /public/images/hero/ to update without code changes.
 */
export const HERO_FRAME_IMAGES = [
  {
    id: "a",
    src: "/images/hero/frame-a.jpg",
    alt: "Family gathered warmly around a shared meal",
    className:
      "photo-frame photo-frame-a absolute right-[6%] top-[14%] hidden h-[42%] w-[28%] sm:block lg:right-[10%] lg:w-[24%]",
  },
  {
    id: "b",
    src: "/images/hero/frame-b.jpg",
    alt: "Parents walking with children through soft outdoor light",
    className:
      "photo-frame photo-frame-b absolute bottom-[12%] right-[22%] hidden h-[36%] w-[24%] sm:block lg:right-[28%] lg:w-[20%]",
  },
  {
    id: "c",
    src: "/images/hero/frame-c.jpg",
    alt: "Close family moment filled with quiet affection",
    className:
      "photo-frame photo-frame-c absolute right-[2%] bottom-[28%] hidden h-[30%] w-[18%] lg:block",
  },
] as const;

/**
 * Sign-in / sign-up collage — complementary to landing hero tones.
 * Files live in /public/images/login/
 */
export const LOGIN_PANEL_IMAGES = [
  {
    id: "1",
    src: "/images/login/panel-1.jpg",
    alt: "Friends laughing together in warm evening light",
    span: "tall" as const,
  },
  {
    id: "2",
    src: "/images/login/panel-2.jpg",
    alt: "Children playing gently outdoors",
    span: "wide" as const,
  },
  {
    id: "3",
    src: "/images/login/panel-3.jpg",
    alt: "Family sharing a quiet, joyful moment",
    span: "wide" as const,
  },
] as const;
