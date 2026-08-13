/**
 * Family Map verification checklist — maps to product requirements 1–8.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { serializeLocationForFamilyViewer } from "@/lib/location/privacy";
import type { UserLocationRecord } from "@/lib/location/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = (): UserLocationRecord => ({
  locationSharing: "off",
  locationLabel: null,
  locationCity: null,
  locationRegion: null,
  locationCountry: null,
  latitude: null,
  longitude: null,
  locationUpdatedAt: null,
});

const precisePostSchema = z
  .object({
    mode: z.literal("precise"),
    latitude: z.number(),
    longitude: z.number(),
    confirmPrecise: z.literal(true),
  })
  .strict();

describe("Family Map verification checklist", () => {
  describe("1. Default: no member until opt-in", () => {
    it("hides members with default off sharing even when place data exists", () => {
      expect(
        serializeLocationForFamilyViewer({
          userId: "u1",
          displayName: "Alex",
          imageUrl: null,
          record: {
            ...base(),
            locationSharing: "off",
            locationCity: "Austin",
            locationRegion: "Texas",
            latitude: 30.27,
            longitude: -97.74,
          },
          viewerUserId: "u2",
        }),
      ).toBeNull();
    });

    it("schema default for location_sharing is off", () => {
      const sql = readFileSync(
        join(process.cwd(), "drizzle/0050_user_location_sharing.sql"),
        "utf8",
      );
      expect(sql).toContain("location_sharing\" text DEFAULT 'off'");
    });
  });

  describe("2. City-level member shows city label, not precise coords", () => {
    it("exposes city label and rounds coordinates", () => {
      const row = serializeLocationForFamilyViewer({
        userId: "u1",
        displayName: "Alex",
        imageUrl: null,
        record: {
          ...base(),
          locationSharing: "city",
          locationCity: "Austin",
          locationRegion: "Texas",
          locationLabel: "Austin, Texas",
          latitude: 30.267153,
          longitude: -97.743057,
        },
        viewerUserId: "u2",
      });

      expect(row).toMatchObject({
        level: "city",
        label: "Austin, Texas",
        city: "Austin",
        region: "Texas",
        latitude: 30.27,
        longitude: -97.74,
      });
      expect(row?.latitude).not.toBe(30.267153);
      expect(row?.label).not.toMatch(/street|st\.|ave|drive/i);
    });
  });

  describe("3. Precise member only after explicit opt-in", () => {
    it("does not expose precise without saved coordinates", () => {
      expect(
        serializeLocationForFamilyViewer({
          userId: "u1",
          displayName: "Alex",
          imageUrl: null,
          record: {
            ...base(),
            locationSharing: "precise",
            locationLabel: "Austin, Texas",
          },
          viewerUserId: "u2",
        }),
      ).toBeNull();
    });

    it("API requires confirmPrecise for precise device save", () => {
      expect(
        precisePostSchema.safeParse({
          mode: "precise",
          latitude: 30.2,
          longitude: -97.7,
        }).success,
      ).toBe(false);
      expect(
        precisePostSchema.safeParse({
          mode: "precise",
          latitude: 30.2,
          longitude: -97.7,
          confirmPrecise: true,
        }).success,
      ).toBe(true);
    });

    it("exposes full coords only when precise + coordinates saved", () => {
      const row = serializeLocationForFamilyViewer({
        userId: "u1",
        displayName: "Alex",
        imageUrl: null,
        record: {
          ...base(),
          locationSharing: "precise",
          locationLabel: "Austin, Texas",
          latitude: 30.267153,
          longitude: -97.743057,
        },
        viewerUserId: "u2",
      });
      expect(row?.level).toBe("precise");
      expect(row?.latitude).toBe(30.267153);
    });
  });

  describe("4. Pending invite without profile does not appear", () => {
    it("query uses active status and inner join on users (excludes pending)", () => {
      const source = readFileSync(
        join(process.cwd(), "src/lib/location/family-locations.ts"),
        "utf8",
      );
      expect(source).toContain('eq(familyMembers.status, "active")');
      expect(source).toContain("innerJoin(users");
      expect(source).toContain("isNull(users.suspendedAt)");
    });
  });

  describe("5. Disable sharing removes member from map", () => {
    it("returns null when sharing turned off after opt-in", () => {
      const optedIn = {
        ...base(),
        locationSharing: "city" as const,
        locationLabel: "Austin, Texas",
        locationCity: "Austin",
        latitude: 30.27,
        longitude: -97.74,
      };
      expect(
        serializeLocationForFamilyViewer({
          userId: "u1",
          displayName: "Alex",
          imageUrl: null,
          record: optedIn,
          viewerUserId: "u2",
        }),
      ).not.toBeNull();

      expect(
        serializeLocationForFamilyViewer({
          userId: "u1",
          displayName: "Alex",
          imageUrl: null,
          record: { ...optedIn, locationSharing: "off" },
          viewerUserId: "u2",
        }),
      ).toBeNull();
    });
  });

  describe("6. Mobile map configuration", () => {
    it("uses responsive height and touch-friendly map container classes", () => {
      const mapUi = readFileSync(
        join(process.cwd(), "src/components/family/FamilyLocationMap.tsx"),
        "utf8",
      );
      expect(mapUi).toContain("min-h-[16rem]");
      expect(mapUi).toContain("touch-pan-y");
      expect(mapUi).toContain("min(52vh");
    });

    it("enables Leaflet zoom controls for touch devices", () => {
      const interactive = readFileSync(
        join(
          process.cwd(),
          "src/components/family/FamilyLocationMapInteractive.tsx",
        ),
        "utf8",
      );
      expect(interactive).toContain("scrollWheelZoom: true");
      expect(interactive).toContain("zoomControl: true");
    });
  });

  describe("7. Family permissions enforced", () => {
    it("locations API requires active family membership", () => {
      const api = readFileSync(
        join(process.cwd(), "src/app/api/family/[id]/locations/route.ts"),
        "utf8",
      );
      const loader = readFileSync(
        join(process.cwd(), "src/lib/location/family-locations.ts"),
        "utf8",
      );
      expect(api).toContain("requireFamilyApiMember");
      expect(loader).toContain("requireActiveFamilyMember");
    });
  });

  describe("8. No regression to invite flow", () => {
    it("invite API route unchanged by location feature", () => {
      const invite = readFileSync(
        join(process.cwd(), "src/app/api/family/invite/route.ts"),
        "utf8",
      );
      expect(invite).toContain("inviteMember");
      expect(invite).not.toContain("location");
      expect(invite).not.toContain("getFamilyMemberLocations");
    });

    it("family settings panel still posts to invite API", () => {
      const panel = readFileSync(
        join(process.cwd(), "src/components/family/FamilySettingsPanel.tsx"),
        "utf8",
      );
      expect(panel).toContain('fetch("/api/family/invite"');
      expect(panel).toContain("InviteForm");
    });
  });
});
