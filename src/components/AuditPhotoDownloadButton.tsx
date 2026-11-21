import { useState } from "react";
import { toast } from "sonner";
import { downloadAuditPhoto } from "@/lib/photos";

export function AuditPhotoDownloadButton({ photoId }: { photoId: string }) {
  const [downloading, setDownloading] = useState(false);
  return (
    <button
      type="button"
      disabled={downloading}
      className="absolute left-4 top-4 rounded-full bg-white/15 px-3 py-2 text-sm text-white hover:bg-white/25 disabled:opacity-60"
      onClick={async (event) => {
        event.stopPropagation();
        if (downloading) return;
        setDownloading(true);
        try {
          await downloadAuditPhoto(photoId);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "تعذر تنزيل الصورة");
        } finally {
          setDownloading(false);
        }
      }}
    >
      {downloading ? "جاري التنزيل…" : "تنزيل الصورة"}
    </button>
  );
}
