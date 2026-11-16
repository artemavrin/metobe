// The levels of a sidebar slide like a stack (P7 «Погружение»): the settings' menu and its lists, the chats and the
// memory's list.
export const levelMotion = (reduce: boolean) => ({
  animate: "center",
  exit: "exit",
  initial: "enter",
  transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const },
  variants: {
    center: { filter: "blur(0px)", opacity: 1, transform: "translateX(0px)" },
    enter: (dir: number) => ({
      filter: reduce ? "blur(0px)" : "blur(2px)",
      opacity: 0,
      transform: `translateX(${reduce ? 0 : dir * 16}px)`,
    }),
    exit: (dir: number) => ({
      filter: reduce ? "blur(0px)" : "blur(2px)",
      opacity: 0,
      transform: `translateX(${reduce ? 0 : -dir * 16}px)`,
    }),
  },
});
