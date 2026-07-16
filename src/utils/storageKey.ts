import path from "path";

export const buildStorageKey = (
  userName: string,
  originalName: string,
): string => {
  const extension = path.extname(originalName);

  const fileName = path
    .basename(originalName, extension)
    .replace(/[^\w-]/g, "_");

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .split(".")[0];

  return `${userName}_${fileName}_${timestamp}${extension}`;
};
