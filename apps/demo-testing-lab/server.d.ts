import type { Server } from 'node:http';

export const server: Server;
export const bugConfig: Record<string, any>;
export function setBuildMode(mode: string): void;
