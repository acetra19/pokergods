/**
 * POKERGODS Bot Arena - API Key Management
 * Handles bot authentication via API keys
 */
import type { ApiKeyRecord, ApiKeyPermission } from './types.js';
/**
 * Generate a new API key for a bot
 * Returns the raw key (only shown once) and the record
 */
export declare function generateApiKey(botId: string, ownerId: string, permissions?: ApiKeyPermission[]): {
    rawKey: string;
    record: ApiKeyRecord;
};
/**
 * Hash an API key for storage/lookup
 */
export declare function hashKey(rawKey: string): string;
/**
 * Validate an API key and return the associated record
 */
export declare function validateApiKey(rawKey: string): ApiKeyRecord | null;
/**
 * Check if a key has a specific permission
 */
export declare function hasPermission(rawKey: string, permission: ApiKeyPermission): boolean;
/**
 * Get bot ID from API key
 */
export declare function getBotIdFromKey(rawKey: string): string | null;
/**
 * Revoke an API key
 */
export declare function revokeApiKey(keyHash: string): boolean;
/**
 * Revoke all keys for a bot
 */
export declare function revokeAllKeysForBot(botId: string): number;
/**
 * List all keys for a bot (returns records, not raw keys)
 */
export declare function listKeysForBot(botId: string): ApiKeyRecord[];
/**
 * Get stats about API keys
 */
export declare function getApiKeyStats(): {
    totalKeys: number;
    activeToday: number;
    byBot: Map<string, number>;
};
export declare function loadApiKeys(): Promise<void>;
import type { Request, Response, NextFunction } from 'express';
/**
 * Express middleware to require bot authentication
 */
export declare function requireBotAuth(req: Request, res: Response, next: NextFunction): void;
/**
 * Middleware to require specific permission
 */
export declare function requirePermission(permission: ApiKeyPermission): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=apiKeys.d.ts.map