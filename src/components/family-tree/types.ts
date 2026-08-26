export type FamilyTreePersonCover = {
  personId: string;
  previewUrl: string | null;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  framing: {
    avatarFocusX: number | null;
    avatarFocusY: number | null;
    avatarZoom: number | null;
  } | null;
};
