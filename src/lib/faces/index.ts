export {
  detectAndStoreFacesForMedia,
  getFaceDetectionProvider,
  isFaceDetectionEnabled,
  resolveFaceDetectionProviderName,
  FACE_DETECTION_PROVIDERS,
  FaceDetectionError,
  type DetectAndStoreFacesOptions,
  type DetectAndStoreFacesResult,
  type DetectedFace,
  type FaceDetectionProvider,
  type FaceDetectionProviderName,
  type FaceDetectionProviderResult,
} from "@/lib/faces/detection";

export {
  maybeEnqueueFaceDetectionForMedia,
  processFacesForMedia,
  type MaybeEnqueueFaceDetectionOptions,
  type ProcessFacesForMediaOptions,
  type ProcessFacesForMediaResult,
} from "@/lib/faces/pipeline";

export {
  applyPersonMerge,
  groupFaces,
  groupUnassignedFaces,
  reprocessFaceGrouping,
  suggestPersonMerges,
  type GroupFaceDecision,
  type GroupFacesResult,
  type PersonMergeSuggestion,
  type ReprocessGroupingOptions,
  type ReprocessGroupingResult,
  type SuggestMergesResult,
} from "@/lib/faces/grouping";

export {
  groupFacesWithRekognitionIdentity,
  reprocessFacesWithRekognitionIdentity,
  consolidatePeopleWithRekognitionIdentity,
  repairSameMediaPersonCollisions,
  shouldUseRekognitionIdentity,
} from "@/lib/faces/identity-grouping";

export {
  averageEmbeddings,
  cosineSimilarity,
  defaultFaceSimilarityScorer,
  getDefaultMatchThreshold,
  getDefaultMergeThreshold,
  resolveModelEmbedding,
  type FaceSimilarityScorer,
} from "@/lib/faces/similarity";
