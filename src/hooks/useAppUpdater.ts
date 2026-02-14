import { useEffect, useState, useRef } from 'react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
}

export const useAppUpdater = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);

  const checkForUpdates = async (silent = false) => {
    setIsChecking(true);
    setError(null);

    try {
      const update = await check();

      if (update) {
        updateRef.current = update;
        console.log('Update available:', {
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          date: update.date,
        });
        setUpdateInfo({
          available: true,
          currentVersion: update.currentVersion,
          latestVersion: update.version,
          body: update.body,
        });
        return true;
      } else {
        updateRef.current = null;
        setUpdateInfo({
          available: false,
          currentVersion: '', // Will be filled by app version
        });
        if (!silent) {
          // Optionally show "No updates available" message
        }
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to check for updates:', err);
      return false;
    } finally {
      setIsChecking(false);
    }
  };

  const installUpdate = async () => {
    if (!updateInfo?.available) {
      const err = 'Update info not available';
      console.error(err);
      setError(err);
      return;
    }

    if (!updateRef.current) {
      const err = 'Update reference is null';
      console.error(err);
      setError(err);
      return;
    }

    setIsUpdating(true);
    setError(null);

    try {
      const update = updateRef.current;
      console.log('Starting update download and install...');

      // Download and install
      let downloadedBytes = 0;
      
      await update.downloadAndInstall((event) => {
        console.log('Update event:', event.event);
        switch (event.event) {
          case 'Started':
            console.log('Download started, content length:', event.data.contentLength);
            setUpdateProgress({ downloaded: 0, total: event.data.contentLength || 0 });
            break;
          case 'Progress':
            downloadedBytes += event.data.chunkLength;
            setUpdateProgress((prev) => ({
              downloaded: downloadedBytes,
              total: prev?.total || 0,
            }));
            break;
          case 'Finished':
            console.log('Download finished successfully');
            setUpdateProgress(null);
            break;
        }
      });

      console.log('Download and install complete, relaunching...');
      // Relaunch the app
      await relaunch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to install update:', message);
      console.error('Full error:', err);
      setError(message);
      setIsUpdating(false);
    }
  };

  const dismissUpdate = () => {
    setUpdateInfo(null);
    updateRef.current = null;
    setError(null);
  };

  // Check for updates on mount
  useEffect(() => {
    // Enable in both dev and production for testing
    checkForUpdates(true);
  }, []);

  return {
    updateInfo,
    isChecking,
    isUpdating,
    updateProgress,
    error,
    checkForUpdates,
    installUpdate,
    dismissUpdate,
  };
};
