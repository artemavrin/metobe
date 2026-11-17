// The page the person was on before the settings window opened over it (app/(app)/@modal): closing the window goes
// back there, however many sections they went through in it. Kept by <LastPage /> in the app's layout — not in the
// window: Next mounts the window anew on each section, so anything it keeps itself starts over on every step.
let page = "/";
// Settings screens shown since that page: one — closing takes the entry the window added away (history back); more —
// it goes to the page, not to the section before.
let steps = 0;
let seen = "";

/** One path the app is on; the same path twice (a re-render, React's double effect) counts once. */
export const notePath = (pathname: string, full: string) => {
  if (pathname === seen) {
    return;
  }
  seen = pathname;
  if (pathname.startsWith("/settings")) {
    steps += 1;
  } else {
    page = full;
    steps = 0;
  }
};

export const lastPage = () => page;

export const settingsSteps = () => steps;
