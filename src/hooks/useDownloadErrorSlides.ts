import { useEffect, useMemo } from "react";

type FloatingErrorItem = {
  id: string;
  title: string;
  phase: "video" | "comments" | "metadata";
  details: string;
  createdAt: number;
};

type DownloadErrorSlide = {
  title: string;
  video?: FloatingErrorItem;
  comments?: FloatingErrorItem;
  metadata?: FloatingErrorItem;
  createdAt: number;
};

type UseDownloadErrorSlidesParams = {
  downloadErrorItems: FloatingErrorItem[];
  setDownloadErrorIndex: React.Dispatch<React.SetStateAction<number>>;
};

export function useDownloadErrorSlides({
  downloadErrorItems,
  setDownloadErrorIndex,
}: UseDownloadErrorSlidesParams) {
  const downloadErrorSlides = useMemo(() => {
    if (downloadErrorItems.length === 0) return [] as DownloadErrorSlide[];
    const byTitle = new Map<string, DownloadErrorSlide>();
    downloadErrorItems.forEach((item) => {
      const existing = byTitle.get(item.title);
      const next = existing ?? {
        title: item.title,
        createdAt: item.createdAt,
      };
      if (item.phase === "video") {
        if (!next.video || next.video.createdAt < item.createdAt) {
          next.video = item;
        }
      } else if (item.phase === "comments") {
        if (!next.comments || next.comments.createdAt < item.createdAt) {
          next.comments = item;
        }
      } else {
        if (!next.metadata || next.metadata.createdAt < item.createdAt) {
          next.metadata = item;
        }
      }
      next.createdAt = Math.max(
        next.createdAt,
        next.video?.createdAt ?? 0,
        next.comments?.createdAt ?? 0,
        next.metadata?.createdAt ?? 0
      );
      byTitle.set(item.title, next);
    });
    return Array.from(byTitle.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }, [downloadErrorItems]);

  useEffect(() => {
    if (downloadErrorSlides.length === 0) {
      setDownloadErrorIndex(0);
      return;
    }
    setDownloadErrorIndex((prev) =>
      Math.min(Math.max(prev, 0), downloadErrorSlides.length - 1)
    );
  }, [downloadErrorSlides.length, setDownloadErrorIndex]);

  const hasDownloadErrors = downloadErrorItems.length > 0;

  return { downloadErrorSlides, hasDownloadErrors };
}
