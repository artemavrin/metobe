// Settings opened by their address put the window in the page (app/(app)/settings); the first section picked in it is
// a soft navigation, which Next intercepts into app/(app)/@modal — a second window over the first. The two hand over:
// the window over the page takes the place of the one in it without opening anew, and the one in the page steps
// aside while it is there. Kept here, not in the windows: they are in two slots and never see each other.
let inPage = 0;
let over = 0;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const subscribeSettingsWindows = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** A window over the page is open: the one in the page steps aside. */
export const settingsWindowOver = () => over > 0;

/** A window in the page is open: one opened over it takes its place, it does not open anew. */
export const settingsWindowInPage = () => inPage > 0;

/** Counts a settings window while it is mounted; returns the cleanup. */
export const mountSettingsWindow = (intercepted: boolean) => {
  if (intercepted) {
    over += 1;
  } else {
    inPage += 1;
  }
  emit();
  return () => {
    if (intercepted) {
      over -= 1;
    } else {
      inPage -= 1;
    }
    emit();
  };
};
