export interface TaskToolOutput {
  description?: string;
  status?: string;
  sessionId?: string;
  steps?: number;
  output?: string;
}

export function parseTaskToolOutput(value: string): TaskToolOutput | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;
    return {
      description: typeof record.description === 'string' ? record.description : undefined,
      status: typeof record.status === 'string' ? record.status : undefined,
      sessionId: typeof record.sessionId === 'string' ? record.sessionId : undefined,
      steps: typeof record.steps === 'number' ? record.steps : undefined,
      output: typeof record.output === 'string' ? record.output : undefined,
    };
  } catch {
    return null;
  }
}

export function formatTaskToolResultForConsole(value: string): string {
  const task = parseTaskToolOutput(value);
  if (!task) {
    return '✓ task completed';
  }

  const details = [
    task.status ? `task ${task.status}` : 'task completed',
    typeof task.steps === 'number' ? `steps: ${task.steps}` : undefined,
  ].filter(Boolean);
  const summary = `✓ ${details.join('; ')}`;
  const output = task.output?.trim();

  return output ? `${summary}\n${output}` : summary;
}
