/** An avatar goes into the profile as a data URL: small, and only an image a browser draws itself. */
export const MAX_AVATAR_BYTES = 200 * 1024;
const AVATAR = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/u;

/** Whether a string may be stored as an avatar: a png, jpeg or webp data URL of at most 200 KB. */
export const isAvatar = (value: string) =>
  AVATAR.test(value) &&
  // Base64 is four characters for three bytes.
  Math.ceil(((value.length - value.indexOf(",") - 1) * 3) / 4) <=
    MAX_AVATAR_BYTES;
