# Secure Secret Storage Architecture

## 1. Storage Location & Data Protection

Secrets configured via the Settings UI are never saved in:
- Plaintext SQLite columns
- Browser `localStorage` or `sessionStorage`
- Zustand global stores
- Frontend application bundles
- Application logs or stack traces

### 1.1 Electron `safeStorage` (Windows DPAPI)
When running within the Electron desktop runtime on Windows, `SecretStore` utilizes `electron.safeStorage.encryptString()` and `decryptString()`. These primitives bind encryption to the active Windows user account via Data Protection API (DPAPI).

### 1.2 Encrypted Vault File
Encrypted payloads are written to:
`%APPDATA%/test-io-agent-studio/secrets/ai_credentials.vault`

Inside the file, data is serialized as:
```json
{
  "version": 1,
  "updatedAt": "2026-10-22T06:50:00.000Z",
  "entries": {
    "gemini": {
      "iv": "3a7b...",
      "tag": "8f12...",
      "ciphertext": "04e9..."
    }
  }
}
```

### 1.3 Headless & Test Fallback
When running under automated testing or CLI environments (`tsx`, `node:test`) where Electron's GUI runtime is unavailable, `SecretStore` automatically initializes an AES-256-GCM cipher with a machine-bound scrypt key derivation.

---

## 2. Credential Replacement & Deletion Lifecycle

- **Atomic Replacement:** Rotating or replacing a key validates non-empty input before overwriting disk state. If validation fails, the previously active credential is preserved intact.
- **Immediate Invalidation on Deletion:** Calling `deleteSecret(providerId)` removes the encrypted key from disk and invalidates cached verification metadata in the SQLite database.
- **Centralized Redaction:** Stack traces, log lines, and diagnostic records are piped through `SecretStore.redactSecret()`, replacing known key patterns (`AIzaSy...`, `AQ....`, `sk-...`, `sk-ant-...`) with sanitized tokens.
