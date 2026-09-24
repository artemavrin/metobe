// Micro-motion for the settings sections. List navigation: the selected-row background slides (useListHighlight) and
// the detail enters with a 6px rise; toggles change colour; the rare «I changed the logo» moment gets a small pop.
// Keyboard-driven changes don't animate.
export const MOTION_CSS = `
.v3-appear { transition: opacity 120ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .v3-appear { opacity: 0; } }

.v3-enter { transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1), transform 200ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .v3-enter { opacity: 0; transform: translateY(6px); } }

.v3-drop-in { transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1), transform 200ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .v3-drop-in { opacity: 0; transform: translateY(-4px); } }

.v3-pop { transition: opacity 250ms cubic-bezier(0.23, 1, 0.32, 1), transform 250ms cubic-bezier(0.23, 1, 0.32, 1), filter 250ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .v3-pop { opacity: 0; transform: scale(0.9); filter: blur(2px); } }

.v3-slide-in, .v3-slide-back { transition: opacity 180ms cubic-bezier(0.23, 1, 0.32, 1), transform 180ms cubic-bezier(0.23, 1, 0.32, 1); }
@starting-style { .v3-slide-in { opacity: 0; transform: translateX(12px); } }
@starting-style { .v3-slide-back { opacity: 0; transform: translateX(-12px); } }

.v3-press { transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.v3-press:active { transform: scale(0.97); }

.v3-tone { transition: color 150ms ease; }
.v3-dot { transition: background-color 200ms ease; }

@media (prefers-reduced-motion: reduce) {
  .v3-enter, .v3-drop-in, .v3-pop, .v3-slide-in, .v3-slide-back { transition: opacity 150ms ease; }
  @starting-style { .v3-enter, .v3-drop-in, .v3-pop, .v3-slide-in, .v3-slide-back { transform: none; filter: none; } }
  .v3-press:active { transform: none; }
}
`;
