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
  if (!isOpen) return null;
  const canSubmit = addMode === "video" ? videoUrl.trim() : channelUrl.trim();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>動画を追加</h2>
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
              動画
            </button>
            <button
              className={addMode === "channel" ? "active" : ""}
              onClick={() => onChangeAddMode("channel")}
              type="button"
            >
              チャンネル
            </button>
          </div>
          {addMode === "video" ? (
            <label>
              動画URL
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => onChangeVideoUrl(e.target.value)}
              />
            </label>
          ) : (
            <label>
              チャンネルURL
              <input
                type="url"
                placeholder="https://www.youtube.com/@channel"
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
              <span>追加と同時にダウンロードする</span>
            </label>
          )}
          {errorMessage && <p className="error">{errorMessage}</p>}
        </div>
        <div className="modal-footer">
          <button className="ghost" onClick={onClose}>
            キャンセル
          </button>
          <button
            className="primary"
            onClick={addMode === "video" ? onAddVideo : onAddChannel}
            disabled={isAdding || !canSubmit}
          >
            {addMode === "video" ? "追加" : "まとめて追加"}
          </button>
        </div>
      </div>
    </div>
  );
}
