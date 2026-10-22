import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';
import type { AiProviderId } from '@test-io-agent/shared';

export interface SecretStoreOptions {
  storageDir?: string;
  useFallbackEncryption?: boolean;
}

/**
 * SecretStore provides secure OS-backed encryption for AI provider API credentials.
 * In Electron on Windows, it uses Electron safeStorage (Windows DPAPI).
 * In Node.js / test environments where safeStorage is unavailable, it utilizes
 * AES-256-GCM encryption with an OS-user-bound derived key.
 * Plaintext secrets are NEVER written to disk, SQLite columns, or logs.
 */
export class SecretStore {
  private storageDir: string;
  private secretsFilePath: string;
  private electronSafeStorage: any = null;

  constructor(options: SecretStoreOptions = {}) {
    if (options.storageDir) {
      this.storageDir = options.storageDir;
    } else {
      try {
        // Attempt to resolve Electron app userData directory if in Electron main
        const electron = require('electron');
        if (electron && electron.app && typeof electron.app.getPath === 'function') {
          this.storageDir = path.join(electron.app.getPath('userData'), 'secure_storage');
        } else {
          this.storageDir = path.resolve(process.cwd(), 'data', 'secure_storage');
        }
      } catch {
        this.storageDir = path.resolve(process.cwd(), 'data', 'secure_storage');
      }
    }

    this.secretsFilePath = path.join(this.storageDir, 'ai_credentials.vault');

    // Detect Electron safeStorage
    try {
      const electron = require('electron');
      if (electron && electron.safeStorage && typeof electron.safeStorage.isEncryptionAvailable === 'function') {
        if (electron.safeStorage.isEncryptionAvailable() && !options.useFallbackEncryption) {
          this.electronSafeStorage = electron.safeStorage;
        }
      }
    } catch {
      this.electronSafeStorage = null;
    }

    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private getFallbackKey(): Buffer {
    const userSeed = `${os.userInfo().username || 'user'}-${os.hostname() || 'host'}-test-io-studio-v2`;
    return crypto.scryptSync(userSeed, 'test-io-agent-vault-salt-2026', 32);
  }

  private encryptValue(plaintext: string): { mode: 'electron' | 'aes-gcm'; payload: string } {
    if (this.electronSafeStorage) {
      const buf = this.electronSafeStorage.encryptString(plaintext);
      return {
        mode: 'electron',
        payload: buf.toString('base64')
      };
    }

    // AES-256-GCM fallback
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');

    return {
      mode: 'aes-gcm',
      payload: JSON.stringify({
        iv: iv.toString('base64'),
        tag: authTag,
        data: encrypted
      })
    };
  }

  private decryptValue(record: { mode: 'electron' | 'aes-gcm'; payload: string }): string {
    if (record.mode === 'electron') {
      if (!this.electronSafeStorage) {
        throw new Error('Electron safeStorage required to decrypt this credential but is currently unavailable.');
      }
      const buf = Buffer.from(record.payload, 'base64');
      return this.electronSafeStorage.decryptString(buf);
    }

    if (record.mode === 'aes-gcm') {
      const parsed = JSON.parse(record.payload);
      const iv = Buffer.from(parsed.iv, 'base64');
      const authTag = Buffer.from(parsed.tag, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.getFallbackKey(), iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(parsed.data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    throw new Error(`Unsupported encryption mode: ${(record as any).mode}`);
  }

  private readVault(): Record<string, { mode: 'electron' | 'aes-gcm'; payload: string }> {
    try {
      if (fs.existsSync(this.secretsFilePath)) {
        const raw = fs.readFileSync(this.secretsFilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch {
      // Corrupt file or reading error
    }
    return {};
  }

  private writeVault(vault: Record<string, { mode: 'electron' | 'aes-gcm'; payload: string }>): void {
    this.ensureDirectory();
    const tempPath = `${this.secretsFilePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(vault, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, this.secretsFilePath);
  }

  public async saveSecret(providerId: AiProviderId, secret: string): Promise<boolean> {
    const trimmed = (secret || '').trim();
    if (!trimmed) {
      throw new Error(`Cannot save empty credential for provider '${providerId}'`);
    }

    const encrypted = this.encryptValue(trimmed);
    const vault = this.readVault();
    vault[providerId] = encrypted;
    this.writeVault(vault);
    return true;
  }

  public async getSecret(providerId: AiProviderId): Promise<string | null> {
    const vault = this.readVault();
    const record = vault[providerId];
    if (!record) return null;

    try {
      return this.decryptValue(record);
    } catch (err: any) {
      console.error(`[SecretStore] Failed to decrypt credential for '${providerId}':`, err.message);
      return null;
    }
  }

  public async hasSecret(providerId: AiProviderId): Promise<boolean> {
    const vault = this.readVault();
    return Boolean(vault[providerId]);
  }

  public async deleteSecret(providerId: AiProviderId): Promise<boolean> {
    const vault = this.readVault();
    if (vault[providerId]) {
      delete vault[providerId];
      this.writeVault(vault);
      return true;
    }
    return false;
  }

  public async rotateSecret(providerId: AiProviderId, replacement: string): Promise<boolean> {
    // Validates replacement before modifying existing key (atomic replacement)
    const trimmed = (replacement || '').trim();
    if (!trimmed) {
      throw new Error(`Replacement secret for '${providerId}' cannot be empty.`);
    }

    return this.saveSecret(providerId, trimmed);
  }

  /**
   * Helper to redact sensitive keys from any logging string or object
   */
  public static redactSecret(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/(AIzaSy[A-Za-z0-9_-]{33})/g, '[REDACTED_GEMINI_KEY]')
      .replace(/(AQ\.[A-Za-z0-9_-]{40,})/g, '[REDACTED_GEMINI_KEY]')
      .replace(/(sk-ant-[A-Za-z0-9_-]{20,})/g, '[REDACTED_ANTHROPIC_KEY]')
      .replace(/(sk-[A-Za-z0-9_-]{20,})/g, '[REDACTED_API_KEY]');
  }
}
