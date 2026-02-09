import type { ReactNode } from "react";
import { AddVideoModal } from "./AddVideoModal";
import { SettingsModal } from "./SettingsModal";
import { IntegrityModal } from "./IntegrityModal";
import { BackupNoticeModal } from "./BackupNoticeModal";
import { ChannelFetchModal } from "./ChannelFetchModal";
import { SwitchConfirmModal } from "./SwitchConfirmModal";
import { PlayerModal } from "./PlayerModal";

type AddMode = "video" | "channel";

type IntegrityIssue = {
  id: string;
  title: string;
  videoMissing: boolean;
  commentsMissing: boolean;
  metadataMissing: boolean;
};

type IntegritySummary = {
  total: number;
  videoMissing: number;
  commentsMissing: number;
  metadataMissing: number;
};

type CookieBrowserOption = { value: string; label: string };

type ToolingCheckStatus = {
  ok: boolean;
  path: string;
};

type AppModalsProps = {
  isAddOpen: boolean;
  addMode: AddMode;
  onChangeAddMode: (mode: AddMode) => void;
  videoUrl: string;
  onChangeVideoUrl: (value: string) => void;
  channelUrl: string;
  onChangeChannelUrl: (value: string) => void;
  downloadOnAdd: boolean;
  onToggleDownloadOnAdd: (value: boolean) => void;
  addErrorMessage: string;
  isAdding: boolean;
  onCloseAdd: () => void;
  onAddVideo: () => void;
  onAddChannel: () => void;

  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  downloadDir: string;
  onPickDownloadDir: () => void;
  cookiesSource: "none" | "file" | "browser";
  onUpdateCookiesSource: (value: "none" | "file" | "browser") => void;
  cookiesFile: string;
  onPickCookiesFile: () => void;
  onClearCookiesFile: () => void;
  cookiesBrowser: string;
  onUpdateCookiesBrowser: (value: string) => void;
  cookieBrowserOptions: CookieBrowserOption[];
  ytDlpPath: string;
  ytDlpStatus: ToolingCheckStatus | null;
  onPickYtDlpPath: () => void;
  onClearYtDlpPath: () => void;
  ffmpegPath: string;
  ffmpegStatus: ToolingCheckStatus | null;
  onPickFfmpegPath: () => void;
  onClearFfmpegPath: () => void;
  ffprobePath: string;
  ffprobeStatus: ToolingCheckStatus | null;
  onPickFfprobePath: () => void;
  onClearFfprobePath: () => void;
  remoteComponents: "none" | "ejs:github" | "ejs:npm";
  onUpdateRemoteComponents: (value: "none" | "ejs:github" | "ejs:npm") => void;
  integritySummary: IntegritySummary | null;
  integrityRunning: boolean;
  onRunIntegrityCheck: () => void;
  onOpenIntegrity: () => void;
  onExportBackup: () => void;
  onImportBackup: () => void;
  settingsErrorMessage: string;

  isIntegrityOpen: boolean;
  onCloseIntegrity: () => void;
  integrityMessage: string;
  integrityIssues: IntegrityIssue[];
  onRelink: () => void;

  isBackupNoticeOpen: boolean;
  backupMessage: string;
  backupRestartRequired: boolean;
  backupRestartCountdown: number;
  onCloseBackupNotice: () => void;
  onRestart: () => void;

  isChannelFetchOpen: boolean;
  channelFetchMessage: string;
  channelFetchProgress: number;
  onCloseChannelFetch: () => void;

  isSwitchConfirmOpen: boolean;
  switchConfirmMessage: string;
  onCancelSwitch: () => void;
  onConfirmSwitch: () => void;

  isPlayerOpen: boolean;
  onClosePlayer: () => void;
  playerContent: ReactNode;
};

export function AppModals({
  isAddOpen,
  addMode,
  onChangeAddMode,
  videoUrl,
  onChangeVideoUrl,
  channelUrl,
  onChangeChannelUrl,
  downloadOnAdd,
  onToggleDownloadOnAdd,
  addErrorMessage,
  isAdding,
  onCloseAdd,
  onAddVideo,
  onAddChannel,
  isSettingsOpen,
  onCloseSettings,
  downloadDir,
  onPickDownloadDir,
  cookiesSource,
  onUpdateCookiesSource,
  cookiesFile,
  onPickCookiesFile,
  onClearCookiesFile,
  cookiesBrowser,
  onUpdateCookiesBrowser,
  cookieBrowserOptions,
  ytDlpPath,
  ytDlpStatus,
  onPickYtDlpPath,
  onClearYtDlpPath,
  ffmpegPath,
  ffmpegStatus,
  onPickFfmpegPath,
  onClearFfmpegPath,
  ffprobePath,
  ffprobeStatus,
  onPickFfprobePath,
  onClearFfprobePath,
  remoteComponents,
  onUpdateRemoteComponents,
  integritySummary,
  integrityRunning,
  onRunIntegrityCheck,
  onOpenIntegrity,
  onExportBackup,
  onImportBackup,
  settingsErrorMessage,
  isIntegrityOpen,
  onCloseIntegrity,
  integrityMessage,
  integrityIssues,
  onRelink,
  isBackupNoticeOpen,
  backupMessage,
  backupRestartRequired,
  backupRestartCountdown,
  onCloseBackupNotice,
  onRestart,
  isChannelFetchOpen,
  channelFetchMessage,
  channelFetchProgress,
  onCloseChannelFetch,
  isSwitchConfirmOpen,
  switchConfirmMessage,
  onCancelSwitch,
  onConfirmSwitch,
  isPlayerOpen,
  onClosePlayer,
  playerContent,
}: AppModalsProps) {
  return (
    <>
      <AddVideoModal
        isOpen={isAddOpen}
        addMode={addMode}
        onChangeAddMode={onChangeAddMode}
        videoUrl={videoUrl}
        onChangeVideoUrl={onChangeVideoUrl}
        channelUrl={channelUrl}
        onChangeChannelUrl={onChangeChannelUrl}
        downloadOnAdd={downloadOnAdd}
        onToggleDownloadOnAdd={onToggleDownloadOnAdd}
        errorMessage={addErrorMessage}
        isAdding={isAdding}
        onClose={onCloseAdd}
        onAddVideo={onAddVideo}
        onAddChannel={onAddChannel}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={onCloseSettings}
        downloadDir={downloadDir}
        onPickDownloadDir={onPickDownloadDir}
        cookiesSource={cookiesSource}
        onUpdateCookiesSource={onUpdateCookiesSource}
        cookiesFile={cookiesFile}
        onPickCookiesFile={onPickCookiesFile}
        onClearCookiesFile={onClearCookiesFile}
        cookiesBrowser={cookiesBrowser}
        onUpdateCookiesBrowser={onUpdateCookiesBrowser}
        cookieBrowserOptions={cookieBrowserOptions}
        ytDlpPath={ytDlpPath}
        ytDlpStatus={ytDlpStatus}
        onPickYtDlpPath={onPickYtDlpPath}
        onClearYtDlpPath={onClearYtDlpPath}
        ffmpegPath={ffmpegPath}
        ffmpegStatus={ffmpegStatus}
        onPickFfmpegPath={onPickFfmpegPath}
        onClearFfmpegPath={onClearFfmpegPath}
        ffprobePath={ffprobePath}
        ffprobeStatus={ffprobeStatus}
        onPickFfprobePath={onPickFfprobePath}
        onClearFfprobePath={onClearFfprobePath}
        remoteComponents={remoteComponents}
        onUpdateRemoteComponents={onUpdateRemoteComponents}
        integritySummary={integritySummary}
        integrityRunning={integrityRunning}
        onRunIntegrityCheck={onRunIntegrityCheck}
        onOpenIntegrity={onOpenIntegrity}
        onExportBackup={onExportBackup}
        onImportBackup={onImportBackup}
        settingsErrorMessage={settingsErrorMessage}
      />

      <IntegrityModal
        isOpen={isIntegrityOpen}
        onClose={onCloseIntegrity}
        integrityMessage={integrityMessage}
        integritySummary={integritySummary}
        integrityIssues={integrityIssues}
        integrityRunning={integrityRunning}
        onRunIntegrityCheck={onRunIntegrityCheck}
        onRelink={onRelink}
      />

      <BackupNoticeModal
        isOpen={isBackupNoticeOpen}
        message={backupMessage}
        restartRequired={backupRestartRequired}
        countdown={backupRestartCountdown}
        onClose={onCloseBackupNotice}
        onRestart={onRestart}
      />

      <ChannelFetchModal
        isOpen={isChannelFetchOpen}
        message={channelFetchMessage}
        progress={channelFetchProgress}
        onClose={onCloseChannelFetch}
      />

      <SwitchConfirmModal
        isOpen={isSwitchConfirmOpen}
        message={switchConfirmMessage}
        onCancel={onCancelSwitch}
        onConfirm={onConfirmSwitch}
      />

      <PlayerModal isOpen={isPlayerOpen} onClose={onClosePlayer}>
        {playerContent}
      </PlayerModal>
    </>
  );
}
