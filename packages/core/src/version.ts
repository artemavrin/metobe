import pkg from "../../../package.json";

/**
 * The version of this build: the release stamps it on the image as METOBE_APP_VERSION (CI takes the image already
 * built and checked for that commit and adds one ENV layer, rather than building it again); a build without it — a
 * dev server, an image built from source — has the repository's own, bumped by release-please.
 */
export const APP_VERSION: string =
  process.env.METOBE_APP_VERSION?.trim() || pkg.version;
