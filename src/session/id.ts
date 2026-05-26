const PREFIXES = {
  session: 'ses',
  message: 'msg',
  part: 'prt',
  permission: 'per',
  run: 'run',
} as const;

export function createSessionId(): string {
  return createId(PREFIXES.session);
}

export function createMessageId(): string {
  return createId(PREFIXES.message);
}

export function createPartId(): string {
  return createId(PREFIXES.part);
}

export function createPermissionId(): string {
  return createId(PREFIXES.permission);
}

export function createRunId(): string {
  return createId(PREFIXES.run);
}

function createId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}
