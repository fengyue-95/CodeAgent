import { AgentInfo, AgentName, evaluateAgentPermission, resolveAgent } from '../agent';
import { ProviderClient, ProviderMessage, ProviderTool } from '../provider';
import { createStore, ensureStateDir, resolveProjectPaths } from '../project';
import { SqliteGraphStore } from '../store/queries';
import {
  SessionInfo,
  SessionMessage,
  SessionMessageWithParts,
  SqliteSessionStore,
  messageToProviderMessage,
} from '../session';
import { SessionProcessor } from './session-processor';
import {
  LocalToolDefinition,
  createLocalToolRegistry,
} from '../tool';

export interface AgentRuntimeInput {
  task: string;
  projectPath: string;
  provider: ProviderClient;
  agent?: AgentName | string;
  model?: string;
  title?: string;
  maxSteps?: number;
  temperature?: number;
}

export interface AgentRuntimeResult {
  session: SessionInfo;
  messages: SessionMessageWithParts[];
  finalMessage?: SessionMessage;
  steps: number;
  status: 'completed' | 'failed';
}

export class AgentRuntime {
  async run(input: AgentRuntimeInput): Promise<AgentRuntimeResult> {
    const agent = resolveAgent(input.agent);
    if (!agent) {
      throw new Error(`Unknown agent: ${input.agent}`);
    }

    const paths = resolveProjectPaths(input.projectPath);
    ensureStateDir(paths.stateDir);
    const store = createStore(paths.dbPath);
    try {
      const sessions = store.sessions();
      const session = sessions.createSession({
        cwd: paths.root,
        agent: agent.name,
        model: input.model ?? input.provider.defaultModel,
        title: input.title,
      });
      sessions.updateSessionStatus(session.id, 'running');

      const userMessage = sessions.createMessage({
        sessionId: session.id,
        role: 'user',
        agent: agent.name,
        model: input.model ?? input.provider.defaultModel,
      });
      sessions.createPart({
        sessionId: session.id,
        messageId: userMessage.id,
        type: 'text',
        text: input.task,
      });

      const run = sessions.createRun({
        sessionId: session.id,
        agent: agent.name,
        model: input.model ?? input.provider.defaultModel,
      });

      try {
        const finalMessage = await this.loop({
          input,
          agent,
          store,
          sessions,
          session,
          projectPath: paths.root,
          runId: run.id,
        });
        sessions.completeRun(run.id, 'completed');
        const completed = sessions.updateSessionStatus(session.id, 'completed') ?? session;
        return {
          session: completed,
          messages: sessions.listMessages(session.id),
          finalMessage,
          steps: sessions.getRun(run.id)?.steps ?? 0,
          status: 'completed',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sessions.completeRun(run.id, 'failed', message);
        const failed = sessions.updateSessionStatus(session.id, 'failed') ?? session;
        return {
          session: failed,
          messages: sessions.listMessages(session.id),
          steps: sessions.getRun(run.id)?.steps ?? 0,
          status: 'failed',
        };
      }
    } finally {
      store.close();
    }
  }

  private async loop(context: {
    input: AgentRuntimeInput;
    agent: AgentInfo;
    store: SqliteGraphStore;
    sessions: SqliteSessionStore;
    session: SessionInfo;
    projectPath: string;
    runId: string;
  }): Promise<SessionMessage | undefined> {
    const maxSteps = context.input.maxSteps ?? context.agent.maxSteps;
    const registry = createLocalToolRegistry({
      projectRoot: context.projectPath,
      store: context.store,
    });
    const tools = registry.all();
    let lastAssistant: SessionMessage | undefined;

    for (let step = 0; step < maxSteps; step += 1) {
      context.sessions.incrementRunSteps(context.runId);
      const assistant = context.sessions.createMessage({
        sessionId: context.session.id,
        role: 'assistant',
        agent: context.agent.name,
        model: context.input.model ?? context.input.provider.defaultModel,
        parentMessageId: lastAssistant?.id,
      });
      lastAssistant = assistant;
      const processor = new SessionProcessor({
        sessions: context.sessions,
        sessionId: context.session.id,
        message: assistant,
      });
      processor.startStep({ step: step + 1 });

      const response = await context.input.provider.generate({
        model: context.input.model,
        temperature: context.input.temperature,
        messages: this.providerMessages(context.agent, context.sessions.listMessages(context.session.id), assistant.id),
        tools: tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })) satisfies ProviderTool[],
        toolChoice: 'auto',
      });
      const choice = response.choices[0];
      const message = choice?.message;
      const text = message?.content ?? '';
      processor.appendText(text);

      const toolCalls = message?.toolCalls ?? [];
      if (toolCalls.length === 0) {
        processor.finish({
          reason: choice?.finishReason,
          usage: response.usage,
        });
        return assistant;
      }

      for (const call of toolCalls) {
        const tool = registry.get(call.function.name);
        const args = processor.parseToolArguments(call.function.arguments);
        if (!tool) {
          processor.recordToolCall({ id: call.id, name: call.function.name, input: args });
          processor.failToolCall({ callId: call.id, message: `Unknown tool: ${call.function.name}` });
          continue;
        }

        const permission = evaluateAgentPermission(context.agent.permission, tool.permission, tool.pattern(args));
        const permissionRecord = context.sessions.createPermission({
          sessionId: context.session.id,
          runId: context.runId,
          toolCallId: call.id,
          permission: tool.permission,
          pattern: tool.pattern(args),
          action: permission.action,
        });

        if (permission.action === 'deny') {
          context.sessions.updatePermissionStatus(permissionRecord.id, 'rejected');
          processor.recordToolCall({ id: call.id, name: tool.name, input: args });
          processor.failToolCall({ callId: call.id, message: `Permission denied: ${tool.permission}` });
          continue;
        }

        if (permission.action === 'ask') {
          processor.recordToolCall({ id: call.id, name: tool.name, input: args });
          processor.failToolCall({ callId: call.id, message: `Permission requires approval: ${tool.permission}` });
          continue;
        }

        context.sessions.updatePermissionStatus(permissionRecord.id, 'approved');
        processor.recordToolCall({ id: call.id, name: tool.name, input: args });

        try {
          const result = await tool.execute(args);
          const output = stringifyToolOutput(result);
          processor.completeToolCall({
            callId: call.id,
            output,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          processor.failToolCall({ callId: call.id, message: errorMessage });
        }
      }

      processor.finish({
        reason: choice?.finishReason,
        usage: response.usage,
      });
    }

    throw new Error(`Agent reached max steps (${maxSteps})`);
  }

  private providerMessages(agent: AgentInfo, timeline: SessionMessageWithParts[], excludeMessageId?: string): ProviderMessage[] {
    const messages: ProviderMessage[] = [
      {
        role: 'system',
        content: agent.systemPrompt,
      },
    ];

    for (const item of timeline) {
      if (item.message.id === excludeMessageId) {
        continue;
      }

      messages.push(messageToProviderMessage(item));
      for (const part of item.parts) {
        if (part.type === 'tool-result') {
          messages.push({
            role: 'tool',
            toolCallId: part.callId,
            content: part.output,
          });
        }
      }
    }

    return messages;
  }

}

function stringifyToolOutput(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
