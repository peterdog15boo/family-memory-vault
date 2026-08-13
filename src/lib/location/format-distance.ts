import type { TranslateFn } from "@/lib/i18n";
import type { FamilyMemberDistance } from "@/lib/location/distance";

export function formatFamilyMemberDistance(
  t: TranslateFn,
  distance: FamilyMemberDistance | null | undefined,
): string | null {
  if (!distance) return null;

  switch (distance.type) {
    case "same_city":
      return t("family.distanceSameCity");
    case "nearby":
      return t("family.distanceNearby");
    case "miles": {
      const formatted =
        distance.miles < 10
          ? distance.miles.toLocaleString(undefined, {
              maximumFractionDigits: 1,
              minimumFractionDigits: 0,
            })
          : Math.round(distance.miles).toLocaleString();
      return t("family.distanceMiles", { distance: formatted });
    }
    default:
      return null;
  }
}
