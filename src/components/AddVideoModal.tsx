import { useTranslation } from "react-i18next";

type AddMode = "video" | "channel";

type AddVideoModalProps = {
  isOpen: boolean;
  addMode: AddMode;
  onChangeAddMode: (mode: AddMode) => void;
  videoUrl: string;
  onChangeVideoUrl: (value: string) => void;
  channelUrl: string;
  onChangeChannelUrl: (value: string) => void;
  downloadOnAdd: boolean;
  onToggleDownloadOnAdd: (value: boolean) => void;
  errorMessage: string;
  isAdding: boolean;
  onClose: () => void;
  onAddVideo: () => void;
  onAddChannel: () => void;
};

export function AddVideoModal({
  isOpen,
  addMode,
  onChangeAddMode,
  videoUrl,
  onChangeVideoUrl,
  channelUrl,
  onChangeChannelUrl,
  downloadOnAdd,
  onToggleDownloadOnAdd,
  errorMessage,
  isAdding,
  onClose,
  onAddVideo,
  onAddChannel,
}: AddVideoModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;
  const canSubmit = addMode === "video" ? videoUrl.trim() : channelUrl.trim();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("addVideo.title")}</h2>
          <button className="icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="segmented">
            <button
              className={addMode === "video" ? "active" : ""}
              onClick={() => onChangeAddMode("video")}
              type="button"
            >
              {t("addVideo.videoTab")}
            </button>
            <button
              className={addMode === "channel" ? "active" : ""}
              onClick={() => onChangeAddMode("channel")}
              type="button"
            >
              {t("addVideo.channelTab")}
            </button>
          </div>
          {addMode === "video" ? (
            <label>
              {t("addVideo.videoUrl")}
              <input
                type="url"
                placeholder={t("addVideo.videoUrlPlaceholder")}
                value={videoUrl}
                onChange={(e) => onChangeVideoUrl(e.target.value)}
              />
            </label>
          ) : (
            <label>
              {t("addVideo.channelUrl")}
              <input
                type="url"
                placeholder={t("addVideo.channelUrlPlaceholder")}
                value={channelUrl}
                onChange={(e) => onChangeChannelUrl(e.target.value)}
              />
            </label>
          )}
          {addMode === "video" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={downloadOnAdd}
                onChange={(e) => onToggleDownloadOnAdd(e.target.checked)}
              />
              <span>{t("addVideo.downloadOnAdd")}</span>
            </label>
          )}
          {errorMessage && <p className="error">{errorMessage}</p>}
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onClose}>
            {t("addVideo.cancel")}
          </button>
          <button
            className="primary"
            onClick={addMode === "video" ? onAddVideo : onAddChannel}
            disabled={isAdding || !canSubmit}
          >
            {t("addVideo.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
