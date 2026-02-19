export type MetadataInput = {
  webpageUrl?: string | null;
  durationSec?: number | null;
  uploadDate?: string | null;
  releaseTimestamp?: number | null;
  timestamp?: number | null;
  liveStatus?: string | null;
  isLive?: boolean | null;
  wasLive?: boolean | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  tags?: string[] | null;
  categories?: string[] | null;
  description?: string | null;
  channelId?: string | null;
  uploaderId?: string | null;
  channelUrl?: string | null;
  uploaderUrl?: string | null;
  availability?: string | null;
  language?: string | null;
  audioLanguage?: string | null;
  ageLimit?: number | null;
};

export type MetadataFields = {
  publishedAt?: string;
  contentType: "video" | "live" | "shorts";
  durationSec?: number;
  liveStatus?: string;
  isLive?: boolean;
  wasLive?: boolean;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  tags?: string[];
  categories?: string[];
  description?: string;
  channelId?: string;
  uploaderId?: string;
  channelUrl?: string;
  uploaderUrl?: string;
  availability?: string;
  language?: string;
  audioLanguage?: string;
  ageLimit?: number;
};

export const parseVideoId = (url: string) => {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const isYouTubeHost =
      hostname === "youtu.be" ||
      hostname.endsWith(".youtu.be") ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com");
    if (!isYouTubeHost) return null;
    if (hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "");
    }
    if (u.pathname.startsWith("/shorts/")) {
      return u.pathname.split("/shorts/")[1]?.split("/")[0] ?? null;
    }
    if (u.pathname.startsWith("/live/")) {
      return u.pathname.split("/live/")[1]?.split("/")[0] ?? null;
    }
    if (u.pathname.startsWith("/embed/")) {
      return u.pathname.split("/embed/")[1]?.split("/")[0] ?? null;
    }
    return u.searchParams.get("v");
  } catch {
    return null;
  }
};

export const parseUploadDate = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.slice(0, 4);
    const m = trimmed.slice(4, 6);
    const d = trimmed.slice(6, 8);
    const iso = new Date(`${y}-${m}-${d}T00:00:00Z`);
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }
  return undefined;
};

export const parseTimestamp = (value?: number | null) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  return undefined;
};

export const deriveContentType = (input: {
  webpageUrl?: string | null;
  durationSec?: number | null;
  liveStatus?: string | null;
  isLive?: boolean | null;
}) => {
  const liveStatus = input.liveStatus?.toLowerCase();
  if (input.isLive || liveStatus === "is_live" || liveStatus === "is_upcoming") {
    return "live" as const;
  }
  if (liveStatus === "post_live" || liveStatus === "was_live") {
    return "live" as const;
  }
  if (input.webpageUrl?.includes("/shorts/")) {
    return "shorts" as const;
  }
  if (typeof input.durationSec === "number" && input.durationSec <= 60) {
    return "shorts" as const;
  }
  return "video" as const;
};

export const isCurrentlyLive = (input: {
  liveStatus?: string | null;
  isLive?: boolean | null;
}) => {
  const liveStatus = input.liveStatus?.toLowerCase();
  return input.isLive === true || liveStatus === "is_live" || liveStatus === "is_upcoming";
};

export const buildMetadataFields = (input: MetadataInput): MetadataFields => {
  const publishedAt =
    parseTimestamp(input.releaseTimestamp) ??
    parseTimestamp(input.timestamp) ??
    parseUploadDate(input.uploadDate);
  return {
    publishedAt,
    contentType: deriveContentType(input),
    durationSec: typeof input.durationSec === "number" ? input.durationSec : undefined,
    liveStatus: input.liveStatus ?? undefined,
    isLive: input.isLive ?? undefined,
    wasLive: input.wasLive ?? undefined,
    viewCount: typeof input.viewCount === "number" ? input.viewCount : undefined,
    likeCount: typeof input.likeCount === "number" ? input.likeCount : undefined,
    commentCount: typeof input.commentCount === "number" ? input.commentCount : undefined,
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    categories: Array.isArray(input.categories) ? input.categories : undefined,
    description: input.description ?? undefined,
    channelId: input.channelId ?? undefined,
    uploaderId: input.uploaderId ?? undefined,
    channelUrl: input.channelUrl ?? undefined,
    uploaderUrl: input.uploaderUrl ?? undefined,
    availability: input.availability ?? undefined,
    language: input.language ?? undefined,
    audioLanguage: input.audioLanguage ?? undefined,
    ageLimit: typeof input.ageLimit === "number" ? input.ageLimit : undefined,
  };
};

export const guessThumbnailExtension = (
  url: string,
  contentType: string | null
) => {
  const normalized = contentType?.toLowerCase() || "";
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return "jpg";
  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/webp")) return "webp";
  if (normalized.includes("image/gif")) return "gif";

  const match = url.toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
  if (match?.[1]) {
    const ext = match[1];
    if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }
  return "jpg";
};

export const convertImageToPng = async (buffer: ArrayBuffer) => {
  try {
    const blob = new Blob([buffer]);
    const bitmap = await createImageBitmap(blob).catch(() => null);
    if (!bitmap) return null;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    if (typeof bitmap.close === "function") {
      bitmap.close();
    }
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!pngBlob) return null;
    const pngBuffer = await pngBlob.arrayBuffer();
    return new Uint8Array(pngBuffer);
  } catch {
    return null;
  }
};

export const deriveUploaderHandle = (
  uploaderId?: string | null,
  uploaderUrl?: string | null,
  channelUrl?: string | null
) => {
  const id = (uploaderId ?? "").trim();
  if (id.startsWith("@")) return id;
  const fromUrl = (value?: string | null) => {
    const raw = (value ?? "").trim();
    if (!raw) return null;
    const match = raw.match(/\/(@[^/?#]+)/);
    return match?.[1] ?? null;
  };
  return fromUrl(uploaderUrl) ?? fromUrl(channelUrl);
};

export const buildThumbnailCandidates = (id: string, primary?: string | null) => [
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
  primary,
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
];
