/**
 * Signed-in home tile photography — local curated assets only for brand tiles.
 * Photos tile may optionally use one clean/ready user cover (never pending).
 */

export const HOME_TILE_ASSETS = {
  photos: {
    src: "/home-tiles/photos.jpg",
    altKey: "dashboard.tilePhotosAlt",
  },
  memories: {
    src: "/home-tiles/memories.jpg",
    altKey: "dashboard.tileMemoriesAlt",
  },
  shared: {
    src: "/home-tiles/shared.jpg",
    altKey: "dashboard.tileSharedAlt",
  },
  people: {
    src: "/home-tiles/people.jpg",
    altKey: "dashboard.tilePeopleAlt",
  },
} as const;

export type HomeTileKey = keyof typeof HOME_TILE_ASSETS;

/**
 * First clean/ready photo preview for the Photos tile only.
 * Never pass pending / non-clean media here.
 */
export function firstReadyPhotoPreview(
  items: Array<{ type: string; previewUrl: string | null }>,
): string | null {
  const photo = items.find((item) => item.type === "photo" && item.previewUrl);
  if (photo?.previewUrl) return photo.previewUrl;
  return null;
}
