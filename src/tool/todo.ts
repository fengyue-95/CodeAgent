export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

export interface TodoWriteArgs {
  todos?: unknown;
}

const statuses = new Set<TodoItem['status']>(['pending', 'in_progress', 'completed', 'cancelled']);
const priorities = new Set<TodoItem['priority']>(['high', 'medium', 'low']);

export function parseTodos(args: TodoWriteArgs): TodoItem[] {
  if (!Array.isArray(args.todos)) {
    throw new Error('Missing or invalid todos');
  }

  return args.todos.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid todo at index ${index}`);
    }
    const value = item as Record<string, unknown>;
    if (typeof value.content !== 'string' || value.content.trim().length === 0) {
      throw new Error(`Invalid todo content at index ${index}`);
    }
    if (!statuses.has(value.status as TodoItem['status'])) {
      throw new Error(`Invalid todo status at index ${index}`);
    }
    if (!priorities.has(value.priority as TodoItem['priority'])) {
      throw new Error(`Invalid todo priority at index ${index}`);
    }

    return {
      content: value.content,
      status: value.status as TodoItem['status'],
      priority: value.priority as TodoItem['priority'],
    };
  });
}
