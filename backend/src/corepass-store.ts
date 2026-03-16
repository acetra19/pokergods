import { randomBytes } from 'node:crypto';

interface Session {
  status: 'pending' | 'authenticated';
  coreId: string | null;
  address: string | null;
  ts: number;
}

const sessions = new Map<string, Session>();
const SESSION_TTL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.ts > SESSION_TTL) sessions.delete(id);
  }
}, 60_000);

export function createSession(): string {
  const id = randomBytes(16).toString('hex');
  sessions.set(id, { status: 'pending', coreId: null, address: null, ts: Date.now() });
  return id;
}

export function setAuthenticated(sessionId: string, coreId: string, address: string): boolean {
  const s = sessions.get(sessionId);
  if (!s) return false;
  s.status = 'authenticated';
  s.coreId = coreId;
  s.address = address;
  return true;
}

export function getSession(sessionId: string): Session | null {
  return sessions.get(sessionId) || null;
}
