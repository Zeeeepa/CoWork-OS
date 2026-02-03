/**
 * Google Drive API helpers
 */

import { GoogleDriveConnectionTestResult, GoogleDriveSettingsData } from '../../shared/types';

export const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
export const GOOGLE_DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DEFAULT_TIMEOUT_MS = 20000;

function parseJsonSafe(text: string): any | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function formatDriveError(status: number, data: any, fallback?: string): string {
  const message =
    data?.error?.message ||
    data?.message ||
    fallback ||
    'Google Drive API error';
  return `Google Drive API error ${status}: ${message}`;
}

export interface GoogleDriveRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, any>;
  timeoutMs?: number;
}

export interface GoogleDriveRequestResult {
  status: number;
  data?: any;
  raw?: string;
}

export async function googleDriveRequest(
  settings: GoogleDriveSettingsData,
  options: GoogleDriveRequestOptions
): Promise<GoogleDriveRequestResult> {
  if (!settings.accessToken) {
    throw new Error('Google Drive access token not configured. Add it in Settings > Integrations > Google Drive.');
  }

  const params = new URLSearchParams();
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  const url = `${GOOGLE_DRIVE_API_BASE}${options.path}${queryString ? `?${queryString}` : ''}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.accessToken}`,
  };

  if (options.method !== 'GET' && options.method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }

  const timeoutMs = options.timeoutMs ?? settings.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const rawText = typeof response.text === 'function' ? await response.text() : '';
    const data = rawText ? parseJsonSafe(rawText) : undefined;

    if (!response.ok) {
      throw new Error(formatDriveError(response.status, data, response.statusText));
    }

    return {
      status: response.status,
      data: data ?? undefined,
      raw: rawText || undefined,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Google Drive API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function googleDriveUpload(
  settings: GoogleDriveSettingsData,
  fileId: string,
  data: Uint8Array,
  contentType: string
): Promise<GoogleDriveRequestResult> {
  if (!settings.accessToken) {
    throw new Error('Google Drive access token not configured. Add it in Settings > Integrations > Google Drive.');
  }

  const url = `${GOOGLE_DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.accessToken}`,
    'Content-Type': contentType,
  };

  const timeoutMs = settings.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: data,
      signal: controller.signal,
    });

    const rawText = typeof response.text === 'function' ? await response.text() : '';
    const dataJson = rawText ? parseJsonSafe(rawText) : undefined;

    if (!response.ok) {
      throw new Error(formatDriveError(response.status, dataJson, response.statusText));
    }

    return {
      status: response.status,
      data: dataJson ?? undefined,
      raw: rawText || undefined,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Google Drive upload request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractUserInfo(data: any): { name?: string; userId?: string; email?: string } {
  if (!data || typeof data !== 'object') return {};
  const user = data.user || data;
  const name = user.displayName || user.name || undefined;
  const userId = user.permissionId || user.userId || user.id || undefined;
  const email = user.emailAddress || user.email || undefined;
  return { name, userId, email };
}

export async function testGoogleDriveConnection(settings: GoogleDriveSettingsData): Promise<GoogleDriveConnectionTestResult> {
  try {
    const result = await googleDriveRequest(settings, {
      method: 'GET',
      path: '/about',
      query: { fields: 'user' },
    });
    const extracted = extractUserInfo(result.data);
    return {
      success: true,
      name: extracted.name,
      userId: extracted.userId,
      email: extracted.email,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to connect to Google Drive',
    };
  }
}
