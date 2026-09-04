export {
  isRetentionAvaEnabled,
  isRetentionEmailEnabled,
} from "@/lib/retention/flags";
export {
  RETENTION_IDLE_MS,
  RETENTION_TIP_IDS,
  type RetentionTipId,
} from "@/lib/retention/types";
export { isUserDormant } from "@/lib/retention/dormancy";
export { drainRetentionEmails } from "@/lib/retention/email";
