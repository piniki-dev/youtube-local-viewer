type VideoDateLike = {
  publishedAt?: string;
  addedAt: string;
};

export const formatDuration = (value?: number | null) => {
  if (!value || Number.isNaN(value)) return "";
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const formatClock = (ms?: number | null) => {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return "";
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const parseDateValue = (value?: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{10,13}$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isNaN(num)) {
      return trimmed.length === 13 ? num : num * 1000;
    }
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getTime();
  }
  return null;
};

export const getVideoSortTime = (video: VideoDateLike) => {
  const published = parseDateValue(video.publishedAt);
  if (published !== null) return published;
  const added = parseDateValue(video.addedAt);
  return added ?? 0;
};

export const formatPublishedAt = (value?: string) => {
  const parsedMs = parseDateValue(value);
  if (parsedMs !== null) {
    return new Date(parsedMs).toLocaleString("ja-JP");
  }
  return value?.trim() ?? "";
};
