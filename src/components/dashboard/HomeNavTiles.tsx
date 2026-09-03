"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { HOME_TILE_ASSETS } from "@/lib/dashboard/home-tiles";

export type HomeTileImages = {
  /** Clean/ready user photo for Photos tile only; other tiles stay curated. */
  photos: string | null;
};

type HomeNavTilesProps = {
  images: HomeTileImages;
};

type TileDef = {
  key: keyof typeof HOME_TILE_ASSETS;
  href: string;
  title: string;
  subtitle: string;
  src: string;
  priority?: boolean;
};

/**
 * Consumer home shortcuts — Photos, Memories, Shared with me, People.
 * Always visible (no plan gates). Empty destinations keep existing empty states.
 */
export function HomeNavTiles({ images }: HomeNavTilesProps) {
  const t = useTranslations();

  const tiles: TileDef[] = [
    {
      key: "photos",
      href: "/media",
      title: t("nav.photos"),
      subtitle: t("dashboard.tilePhotosSubtitle"),
      src: images.photos || HOME_TILE_ASSETS.photos.src,
      priority: true,
    },
    {
      key: "memories",
      href: "/memories",
      title: t("nav.memories"),
      subtitle: t("dashboard.tileMemoriesSubtitle"),
      src: HOME_TILE_ASSETS.memories.src,
    },
    {
      key: "shared",
      href: "/media?scope=shared",
      title: t("dashboard.tileSharedTitle"),
      subtitle: t("dashboard.tileSharedSubtitle"),
      src: HOME_TILE_ASSETS.shared.src,
    },
    {
      key: "people",
      href: "/people",
      title: t("nav.people"),
      subtitle: t("dashboard.tilePeopleSubtitle"),
      src: HOME_TILE_ASSETS.people.src,
    },
  ];

  return (
    <nav className="home-tile-grid" aria-label={t("dashboard.tileNavAria")}>
      {tiles.map((tile) => {
        const remote = /^https?:\/\//i.test(tile.src);
        const name = t("dashboard.tileAria", {
          title: tile.title,
          subtitle: tile.subtitle,
        });
        return (
          <Link
            key={tile.href}
            href={tile.href}
            className="home-tile"
            aria-label={name}
          >
            <Image
              src={tile.src}
              alt=""
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 25vw"
              quality={72}
              priority={tile.priority}
              unoptimized={remote}
              className="home-tile-image"
              aria-hidden
            />
            <span className="home-tile-scrim" aria-hidden />
            <span className="home-tile-copy" aria-hidden>
              <span className="home-tile-title-row">
                <span className="home-tile-title">{tile.title}</span>
                <ChevronRight className="home-tile-chevron" aria-hidden />
              </span>
              <span className="home-tile-subtitle">{tile.subtitle}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
