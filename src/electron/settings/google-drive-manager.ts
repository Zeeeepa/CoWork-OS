/**
 * Google Drive Settings Manager
 *
 * Stores Google Drive integration settings in encrypted database.
 */

import { SecureSettingsRepository } from '../database/SecureSettingsRepository';
import { GoogleDriveSettingsData } from '../../shared/types';

const DEFAULT_SETTINGS: GoogleDriveSettingsData = {
  enabled: false,
  timeoutMs: 20000,
};

export class GoogleDriveSettingsManager {
  private static cachedSettings: GoogleDriveSettingsData | null = null;

  static loadSettings(): GoogleDriveSettingsData {
    if (this.cachedSettings) {
      return this.cachedSettings;
    }

    let settings: GoogleDriveSettingsData = { ...DEFAULT_SETTINGS };

    try {
      if (SecureSettingsRepository.isInitialized()) {
        const repository = SecureSettingsRepository.getInstance();
        const stored = repository.load<GoogleDriveSettingsData>('google-drive');
        if (stored) {
          settings = { ...DEFAULT_SETTINGS, ...stored };
        }
      }
    } catch (error) {
      console.error('[GoogleDriveSettingsManager] Failed to load settings:', error);
    }

    this.cachedSettings = settings;
    return settings;
  }

  static saveSettings(settings: GoogleDriveSettingsData): void {
    try {
      if (!SecureSettingsRepository.isInitialized()) {
        throw new Error('SecureSettingsRepository not initialized');
      }
      const repository = SecureSettingsRepository.getInstance();
      repository.save('google-drive', settings);
      this.cachedSettings = settings;
      console.log('[GoogleDriveSettingsManager] Settings saved');
    } catch (error) {
      console.error('[GoogleDriveSettingsManager] Failed to save settings:', error);
    }
  }

  static clearCache(): void {
    this.cachedSettings = null;
  }
}
