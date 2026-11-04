// sessionStore.ts - LocalStorage + IndexedDB persistence for Moviq
import { BRAND } from '../config/brand';

const DB_NAME = BRAND.dbName;
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';
const SESSION_STORAGE_KEY = BRAND.sessionKey;

export interface SavedSectionItem {
  id: string;
  startSeconds: number;
  endSeconds: number;
  label: string;
  showVisualEditor: boolean;
}

export interface SavedClipMeta {
  id: string;
  name: string;
  duration: number;
  isVideo: boolean;
  sections: SavedSectionItem[];
}

export interface SavedSession {
  version: number;
  updatedAt: number;
  crossfadeSeconds: number;
  normalizeVolume: boolean;
  clips: SavedClipMeta[];
}

// Open IndexedDB database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Save binary media file/blob to IndexedDB
export async function saveMediaBlob(id: string, file: Blob, name: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = {
        id,
        name,
        type: file.type || 'audio/mpeg',
        blob: file,
        savedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save media blob to IndexedDB:', err);
  }
}

// Retrieve binary media file/blob from IndexedDB
export async function getMediaBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not read media blob from IndexedDB:', err);
    return null;
  }
}

// Delete media blob from IndexedDB
export async function deleteMediaBlob(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not delete media blob from IndexedDB:', err);
  }
}

// Clear all stored media blobs from IndexedDB
export async function clearAllMediaBlobs(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not clear media blobs from IndexedDB:', err);
  }
}

// Save session metadata into LocalStorage
export function saveSessionMetadata(session: SavedSession): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Could not save session to localStorage:', err);
  }
}

// Load session metadata from LocalStorage
export function loadSessionMetadata(): SavedSession | null {
  try {
    let raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw && BRAND.legacySessionKeys) {
      for (const legacyKey of BRAND.legacySessionKeys) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (!raw) return null;
    return JSON.parse(raw) as SavedSession;
  } catch (err) {
    console.warn('Could not parse session from localStorage:', err);
    return null;
  }
}

// Clear session metadata and blobs
export async function clearCompleteSession(): Promise<void> {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    if (BRAND.legacySessionKeys) {
      for (const legacyKey of BRAND.legacySessionKeys) {
        localStorage.removeItem(legacyKey);
      }
    }
  } catch (err) {
    console.warn('Could not remove session from localStorage:', err);
  }
  await clearAllMediaBlobs();
}
