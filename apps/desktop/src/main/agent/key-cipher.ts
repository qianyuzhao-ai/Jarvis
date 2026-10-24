import { safeStorage } from 'electron';

/** Encrypts API Keys at rest. The model store depends on this interface so it can run without Electron. */
export interface KeyCipher {
  available(): boolean;
  encrypt(text: string): string;
  decrypt(encrypted: string): string;
}

export const systemKeyCipher: KeyCipher = {
  available: () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  encrypt: (text) => safeStorage.encryptString(text).toString('base64'),
  decrypt: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
};
