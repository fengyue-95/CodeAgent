import { AgentInfo, AgentName, evaluateAgentPermission, resolveAgent } from '../agent';
import { ProviderClient, ProviderMessage, ProviderTool, ProviderUsage } from '../provider';
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
  LocalToolMode,
  LocalSubTaskInput,
  createLocalToolRegistry,
} from '../tool';

export interface AgentRuntimeInput {
  task: string;
  projectPath: string;
  provider: ProviderClient;
  sessionId?: string;
  agent?: AgentName | string;
  model?: string;
  title?: string;
  maxSteps?: number;
  temperature?: number;
  toolMode?: LocalToolMode;
  onEvent?: (event: AgentRuntimeEvent) => void | Promise<void>;
  onPermissionRequest?: (request: AgentPermissionRequest) => boolean | Promise<boolean>;
  subTaskDepth?: number;
}

export interface AgentRuntimeResult {
  session: SessionInfo;
  messages: SessionMessageWithParts[];
  finalMessage?: SessionMessage;
  steps: number;
  status: 'completed' | 'failed';
}

export type AgentRuntimeEvent =
  | { type: 'step-start'; step: number; maxSteps: number }
  | { type: 'assistant-text-delta'; step: number; text: string }
  | { type: 'assistant-text'; step: number; text: string }
  | { type: 'tool-call-start'; step: number; callId: string; tool: string }
  | { type: 'tool-call-delta'; step: number; callId?: string; tool?: string; argumentsDelta: string }
  | { type: 'tool-call'; step: number; callId: string; tool: string; input: Record<string, unknown> }
  | { type: 'permission-request'; step: number; request: AgentPermissionRequest }
  | { type: 'permission-result'; step: number; request: AgentPermissionRequest; approved: boolean }
  | { type: 'tool-result'; step: number; callId: string; tool: string; output: string }
  | { type: 'tool-error'; step: number; callId: string; tool: string; error: string }
  | { type: 'step-finish'; step: number; reason?: string }
  | { type: 'runtime-error'; error: string; errorObject?: unknown };

export interface AgentPermissionRequest {
  sessionId: string;
  runId: string;
  permissionId: string;
  toolCallId: string;
  tool: string;
  permission: string;
  pattern: string;
  input: Record<string, unknown>;
}

interface StreamToolCallState {
  index: number;
  id?: string;
  name?: string;
  arguments: string;
  error?: string;
}

interface StreamStepResult {
  finishReason?: string;
  usage?: ProviderUsage;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
    error?: string;
  }>;
}

const MAX_STREAMED_WRITE_ARGUMENT_CHARS = 16 * 1024;

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
      const session = input.sessionId
        ? sessions.getSession(input.sessionId)
        : sessions.createSession({
          cwd: paths.root,
          agent: agent.name,
          model: input.model ?? input.provider.defaultModel,
          title: input.title,
        });
      if (!session) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
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
        messageId: userMessage.id,
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
        await this.emit(input, { type: 'runtime-error', error: message, errorObject: error });
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
    let maxSteps = context.input.maxSteps ?? context.agent.maxSteps;
    const registry = createLocalToolRegistry({
      projectRoot: context.projectPath,
      store: context.store,
      mode: context.input.toolMode,
      runTask: (taskInput) => this.runSubTask(context, taskInput),
    });
    const tools = registry.all();
    let lastAssistant: SessionMessage | undefined;

    for (let step = 0; step < maxSteps; step += 1) {
      // 检查是否接近步骤限制（剩余 5 步时警告）
      if (step === maxSteps - 5 && maxSteps > 10) {
        await this.emit(context.input, {
          type: 'runtime-error',
          error: `⚠️  接近步骤限制 (${step + 1}/${maxSteps})，任务可能需要继续...`,
        });
      }

      // 达到步骤限制时询问是否继续
      if (step === maxSteps - 1) {
        await this.emit(context.input, {
          type: 'runtime-error',
          error: `⚠️  已达到步骤限制 (${maxSteps} 步)`,
        });

        // 如果有权限请求回调，询问用户是否继续
        if (context.input.onPermissionRequest) {
          const shouldContinue = await context.input.onPermissionRequest({
            sessionId: context.session.id,
            runId: context.runId,
            permissionId: `continue-${step}`,
            toolCallId: 'system',
            tool: 'system',
            permission: 'continue',
            pattern: 'extend-steps',
            input: { currentSteps: maxSteps, proposedExtension: 50 },
          });

          if (shouldContinue) {
            maxSteps += 50; // 增加 50 步
            await this.emit(context.input, {
              type: 'runtime-error',
              error: `✓ 继续执行，新的步骤限制: ${maxSteps}`,
            });
            // 继续循环
          } else {
            // 用户拒绝继续，结束循环
            break;
          }
        } else {
          // 没有回调，直接结束
          break;
        }
      }

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
      await this.emit(context.input, {
        type: 'step-start',
        step: step + 1,
        maxSteps,
      });

      const streamResult = await this.processProviderStream({
        context,
        processor,
        tools,
        step: step + 1,
        assistantMessageId: assistant.id,
      });
      const toolCalls = streamResult.toolCalls;
      if (toolCalls.length === 0) {
        processor.finish({
          reason: streamResult.finishReason,
          usage: streamResult.usage,
        });
        await this.emit(context.input, {
          type: 'step-finish',
          step: step + 1,
          reason: streamResult.finishReason,
        });
        return assistant;
      }

      for (const call of toolCalls) {
        if (call.error) {
          processor.recordToolCall({ id: call.id, name: call.name, input: {} });
          await this.emit(context.input, {
            type: 'tool-call',
            step: step + 1,
            callId: call.id,
            tool: call.name,
            input: {},
          });
          processor.failToolCall({ callId: call.id, message: call.error });
          await this.emit(context.input, {
            type: 'tool-error',
            step: step + 1,
            callId: call.id,
            tool: call.name,
            error: call.error,
          });
          continue;
        }

        let args: Record<string, unknown>;
        try {
          args = processor.parseToolArguments(call.arguments);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          processor.recordToolCall({ id: call.id, name: call.name, input: {} });
          await this.emit(context.input, {
            type: 'tool-call',
            step: step + 1,
            callId: call.id,
            tool: call.name,
            input: {},
          });
          processor.failToolCall({ callId: call.id, message: errorMessage });
          await this.emit(context.input, {
            type: 'tool-error',
            step: step + 1,
            callId: call.id,
            tool: call.name,
            error: errorMessage,
          });
          continue;
        }

        const tool = registry.get(call.name);
        if (!tool) {
          processor.recordToolCall({ id: call.id, name: call.name, input: args });
          const errorMessage = `Unknown tool: ${call.name}`;
          await this.emit(context.input, {
            type: 'tool-call',
            step: step + 1,
            callId: call.id,
            tool: call.name,
            input: args,
          });
          processor.failToolCall({ callId: call.id, message: errorMessage });
          await this.emit(context.input, {
            type: 'tool-error',
            step: step + 1,
            callId: call.id,
            tool: call.name,
            error: errorMessage,
          });
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
          const errorMessage = `Permission denied: ${tool.permission}`;
          await this.emit(context.input, {
            type: 'tool-call',
            step: step + 1,
            callId: call.id,
            tool: tool.name,
            input: args,
          });
          processor.failToolCall({ callId: call.id, message: errorMessage });
          await this.emit(context.input, {
            type: 'tool-error',
            step: step + 1,
            callId: call.id,
            tool: tool.name,
            error: errorMessage,
          });
          continue;
        }

        processor.recordToolCall({ id: call.id, name: tool.name, input: args });
        await this.emit(context.input, {
          type: 'tool-call',
          step: step + 1,
          callId: call.id,
          tool: tool.name,
          input: args,
        });

        if (permission.action === 'ask') {
          const approved = await this.askPermission(context.input, {
            sessionId: context.session.id,
            runId: context.runId,
            permissionId: permissionRecord.id,
            toolCallId: call.id,
            tool: tool.name,
            permission: tool.permission,
            pattern: tool.pattern(args),
            input: args,
          }, step + 1);
          if (!approved) {
            context.sessions.updatePermissionStatus(permissionRecord.id, 'rejected');
            const errorMessage = `Permission rejected: ${tool.permission}`;
            processor.failToolCall({ callId: call.id, message: errorMessage });
            await this.emit(context.input, {
              type: 'tool-error',
              step: step + 1,
              callId: call.id,
              tool: tool.name,
              error: errorMessage,
            });
            continue;
          }

          context.sessions.updatePermissionStatus(permissionRecord.id, 'approved');
        } else {
          context.sessions.updatePermissionStatus(permissionRecord.id, 'approved');
        }

        try {
          const result = await tool.execute(args);
          const output = stringifyToolOutput(result);
          processor.completeToolCall({
            callId: call.id,
            output,
          });
          await this.emit(context.input, {
            type: 'tool-result',
            step: step + 1,
            callId: call.id,
            tool: tool.name,
            output,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          processor.failToolCall({ callId: call.id, message: errorMessage });
          await this.emit(context.input, {
            type: 'tool-error',
            step: step + 1,
            callId: call.id,
            tool: tool.name,
            error: errorMessage,
          });
        }
      }

      processor.finish({
        reason: streamResult.finishReason,
        usage: streamResult.usage,
      });
      await this.emit(context.input, {
        type: 'step-finish',
        step: step + 1,
        reason: streamResult.finishReason,
      });
    }

    throw new Error(`Agent reached max steps (${maxSteps})`);
  }

  private async processProviderStream(input: {
    context: {
      input: AgentRuntimeInput;
      agent: AgentInfo;
      sessions: SqliteSessionStore;
      session: SessionInfo;
    };
    processor: SessionProcessor;
    tools: LocalToolDefinition[];
    step: number;
    assistantMessageId: string;
  }): Promise<StreamStepResult> {
    const toolCalls = new Map<number, StreamToolCallState>();
    const announcedToolCalls = new Set<string>();
    let finishReason: string | undefined;
    let usage: ProviderUsage | undefined;

    for await (const event of input.context.input.provider.stream({
      model: input.context.input.model,
      temperature: input.context.input.temperature,
      messages: this.providerMessages(
        input.context.agent,
        input.context.sessions.listMessages(input.context.session.id),
        input.assistantMessageId
      ),
      tools: input.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })) satisfies ProviderTool[],
      toolChoice: 'auto',
    })) {
      if (event.type === 'text-delta') {
        input.processor.appendText(event.text);
        await this.emit(input.context.input, {
          type: 'assistant-text-delta',
          step: input.step,
          text: event.text,
        });
        continue;
      }

      if (event.type === 'tool-call-delta') {
        const state = toolCalls.get(event.index) ?? {
          index: event.index,
          arguments: '',
        };
        if (event.id) {
          state.id = event.id;
        }
        if (event.name) {
          state.name = event.name;
        }
        if (event.arguments && !state.error) {
          state.arguments += event.arguments;
        }
        if (
          state.name === 'write' &&
          state.arguments.length > MAX_STREAMED_WRITE_ARGUMENT_CHARS &&
          !state.error
        ) {
          state.arguments = '';
          state.error = [
            `Tool argument payload for write is too large to stream safely (>${MAX_STREAMED_WRITE_ARGUMENT_CHARS} characters).`,
            'Do not retry by sending a full large file body in one write call.',
            'Create a minimal skeleton first, then fill the file using multiple focused edit calls or smaller patches.',
          ].join(' ');
        }
        toolCalls.set(event.index, state);
        if (!state.error) {
          input.processor.recordToolCallDelta(event);
        } else if (state.id && state.name) {
          input.processor.recordToolCall({
            id: state.id,
            name: state.name,
            input: {},
          });
        }

        if (state.id && state.name && !announcedToolCalls.has(state.id)) {
          announcedToolCalls.add(state.id);
          await this.emit(input.context.input, {
            type: 'tool-call-start',
            step: input.step,
            callId: state.id,
            tool: state.name,
          });
        }

        if (event.arguments && !state.error) {
          await this.emit(input.context.input, {
            type: 'tool-call-delta',
            step: input.step,
            callId: state.id,
            tool: state.name,
            argumentsDelta: event.arguments,
          });
        }
        continue;
      }

      if (event.type === 'finish') {
        finishReason = event.reason ?? finishReason;
        usage = mergeUsage(usage, event.usage);
        continue;
      }

      if (event.type === 'error') {
        input.processor.recordError(event.error.message);
        throw event.error;
      }
    }

    return {
      finishReason,
      usage,
      toolCalls: Array.from(toolCalls.values())
        .sort((left, right) => left.index - right.index)
        .filter((item): item is StreamToolCallState & { id: string; name: string } => Boolean(item.id && item.name))
        .map((item) => ({
          id: item.id,
          name: item.name,
          arguments: item.arguments,
          error: item.error,
        })),
    };
  }

  private async emit(input: AgentRuntimeInput, event: AgentRuntimeEvent): Promise<void> {
    await input.onEvent?.(event);
  }

  private async askPermission(input: AgentRuntimeInput, request: AgentPermissionRequest, step: number): Promise<boolean> {
    await this.emit(input, {
      type: 'permission-request',
      step,
      request,
    });
    const approved = input.onPermissionRequest ? await input.onPermissionRequest(request) : false;
    await this.emit(input, {
      type: 'permission-result',
      step,
      request,
      approved,
    });
    return approved;
  }

  private async runSubTask(context: {
    input: AgentRuntimeInput;
    projectPath: string;
  }, taskInput: LocalSubTaskInput): Promise<unknown> {
    const depth = context.input.subTaskDepth ?? 0;
    if (depth >= 2) {
      throw new Error('Maximum subagent depth reached');
    }

    const result = await new AgentRuntime().run({
      task: taskInput.prompt,
      projectPath: context.projectPath,
      provider: context.input.provider,
      agent: taskInput.agent ?? 'plan',
      model: context.input.model,
      maxSteps: taskInput.maxSteps ?? 8,
      temperature: context.input.temperature,
      title: taskInput.description,
      onPermissionRequest: context.input.onPermissionRequest,
      subTaskDepth: depth + 1,
    });

    return {
      description: taskInput.description,
      status: result.status,
      sessionId: result.session.id,
      steps: result.steps,
      output: extractAssistantText(result.messages),
    };
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

function mergeUsage(current: ProviderUsage | undefined, next: ProviderUsage | undefined): ProviderUsage | undefined {
  if (!next) {
    return current;
  }

  return {
    promptTokens: next.promptTokens ?? current?.promptTokens,
    completionTokens: next.completionTokens ?? current?.completionTokens,
    totalTokens: next.totalTokens ?? current?.totalTokens,
  };
}

function extractAssistantText(messages: SessionMessageWithParts[]): string {
  return messages
    .filter((item) => item.message.role === 'assistant')
    .flatMap((item) => item.parts)
    .filter((part) => part.type === 'text' || part.type === 'reasoning')
    .map((part) => part.text)
    .join('\n')
    .trim();
}
