// Closing the settings window opened over the start page goes back to `/`: the slot has to match the root too, and
// `[...catchAll]` does not — without this the window stayed on screen after the address had changed.
const Root = () => null;

export default Root;
