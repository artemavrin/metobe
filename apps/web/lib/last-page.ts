// The page the person was on before the settings window opened over it (app/(app)/@modal): closing the window goes
// back there, however many sections they went through in it. Kept by <LastPage /> in the app's layout.
let page = "/";

export const rememberPage = (at: string) => {
  page = at;
};

export const lastPage = () => page;
