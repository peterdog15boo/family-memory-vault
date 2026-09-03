"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";

/**
 * Same /upload entry as Photos — glass panel on the home atmosphere.
 */
export function HomeUploadCard() {
  const t = useTranslations();
  return (
    <section className="home-panel home-upload-card" aria-labelledby="home-upload-title">
      <div className="home-upload-copy">
        <h2 id="home-upload-title" className="home-upload-title">
          {t("nav.upload")}
        </h2>
        <p className="home-upload-safety">
          {t("upload.safetyFirst", { note: t("upload.safetyNote") })}
        </p>
      </div>
      <Link href="/upload" className="ui-btn ui-btn-primary home-upload-cta">
        <Upload className="size-4" aria-hidden />
        {t("pages.uploadPhotos")}
      </Link>
    </section>
  );
}
