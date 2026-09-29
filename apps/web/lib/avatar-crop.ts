const AVATAR_SIZE = 256;

/** A picture cut square from its middle and drawn at 256 px — a webp when the browser can, else a png; null if unreadable. */
export const cropAvatar = async (file: Blob) => {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    canvas
      .getContext("2d")
      ?.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_SIZE,
        AVATAR_SIZE
      );
    bitmap.close();
    return canvas.toDataURL("image/webp", 0.85);
  } catch {
    return null;
  }
};
