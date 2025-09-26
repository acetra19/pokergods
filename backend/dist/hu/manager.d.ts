import type { TableState } from "../tournament/types.js";
export interface HUStatus {
    queueSize: number;
    matchTableId?: string | undefined;
    online?: number;
}
export declare class HUManager {
    private queue;
    private walletToTable;
    private nextId;
    private onlineSet;
    maxOnline: number;
    join(wallet: string): HUStatus;
    leave(wallet: string): HUStatus;
    popMatch(): {
        table: TableState;
    } | null;
    createBotMatch(humanWallet: string, botId?: string): {
        table: TableState;
    };
    status(wallet: string | undefined): HUStatus;
    unmap(wallet: string): void;
    unmapMany(wallets: string[]): void;
}
//# sourceMappingURL=manager.d.ts.map