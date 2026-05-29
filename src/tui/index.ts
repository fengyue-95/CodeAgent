import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface, Interface } from 'node:readline/promises';
import { AgentName } from '../agent';
import { createDeepSeekProvider } from '../provider';
import { createStore, ensureStateDir, resolveProjectPaths } from '../project';
import { AgentPermissionRequest, AgentRuntime, AgentRuntimeEvent } from '../runtime';
import { SessionInfo, SessionMessageWithParts } from '../session';
import { LocalToolMode, closeBrowserSession } from '../tool';
import { parseTaskToolOutput } from '../utils/tool-output';

interface TuiOptions {
  projectArg?: string;
  agent: AgentName;
  model?: string;
  maxSteps?: number;
  toolMode: LocalToolMode;
  continueLatest: boolean;
}

interface TuiState {
  projectRoot: string;
  dbPath: string;
  session: SessionInfo;
  agent: AgentName;
  model?: string;
  maxSteps?: number;
  toolMode: LocalToolMode;
  showDetails: boolean;
  undone?: UndonePrompt;
}

interface UndonePrompt {
  prompt: string;
  agent: AgentName;
  model?: string;
  maxSteps?: number;
  toolMode: LocalToolMode;
}

const HELP_TEXT = [
  'Commands',
  '  /help                    Show this help',
  '  /exit, /quit, /q         Exit TUI',
  '  /new [title]             Start a new session',
  '  /sessions                List sessions and switch',
  '  /agent [name]            Show or change agent',
  '    Available: build, plan, general, explore, scout, review, refactor, test, doc, debug',
  '  /tab                     Cycle agent, same as pressing Tab on an empty prompt',
  '  /tools [core|full]       Show or change tool set',
  '  /model [name]            Show or change model override',
  '  /max-steps [n]           Show or change max steps',
  '  /details                 Toggle tool input/output details',
  '  /init                    Create or update AGENTS.md',
  '  /undo                    Remove the latest user turn from this session',
  '  /redo                    Re-run the latest undone prompt',
  '  /share                   Export current session to .code-agent/share/*.md',
  '',
  'Input helpers',
  '  !command                 Run a shell command and send its output as context',
  '  Tab on empty prompt      Cycle through agent modes',
].join('\n');

const colorEnabled = process.stdout.isTTY && process.env.NO_COLOR !== '1';
const ansi = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  magenta: '\u001b[35m',
  gray: '\u001b[90m',
};

export async function startTui(args: string[] = []): Promise<void> {
  const options = parseTuiArgs(args);
  const paths = resolveProjectPaths(options.projectArg);
  ensureStateDir(paths.stateDir);
  loadLocalEnv(paths.root);

  const store = createStore(paths.dbPath);
  let session: SessionInfo;
  try {
    const sessions = store.sessions();
    const latest = options.continueLatest ? sessions.listSessions(1)[0] : undefined;
    session = latest ?? sessions.createSession({
      cwd: paths.root,
      agent: options.agent,
      model: options.model,
      title: `TUI session - ${new Date().toISOString()}`,
    });
  } finally {
    store.close();
  }

  const state: TuiState = {
    projectRoot: paths.root,
    dbPath: paths.dbPath,
    session,
    agent: options.agent,
    model: options.model,
    maxSteps: options.maxSteps,
    toolMode: options.toolMode,
    showDetails: false,
  };

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    historySize: 100,
  });

  printBanner(state);

  try {
    while (true) {
      const line = (await rl.question(promptLabel(state))).trim();

      if (!line) {
        continue;
      }

      if (line.startsWith('/')) {
        const shouldExit = await handleSlashCommand(line, state, rl);
        if (shouldExit) {
          break;
        }
        continue;
      }

      const prompt = line.startsWith('!')
        ? await shellPrompt(state.projectRoot, line.slice(1).trim())
        : line;
      await runPrompt(prompt, state, rl);
    }
  } finally {
    rl.close();
    await closeBrowserSession();
  }
}

function parseTuiArgs(args: string[]): TuiOptions {
  let projectArg: string | undefined;
  let agent: AgentName = 'build';
  let model: string | undefined;
  let maxSteps: number | undefined;
  let toolMode: LocalToolMode = 'core';
  let continueLatest = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === '--agent') {
      agent = parseAgentName(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--agent=')) {
      agent = parseAgentName(arg.slice('--agent='.length));
      continue;
    }

    if (arg === '--model') {
      model = requireValue(args[index + 1], '--model');
      index += 1;
      continue;
    }

    if (arg.startsWith('--model=')) {
      model = arg.slice('--model='.length);
      continue;
    }

    if (arg === '--max-steps') {
      maxSteps = parsePositiveInteger(args[index + 1], '--max-steps');
      index += 1;
      continue;
    }

    if (arg.startsWith('--max-steps=')) {
      maxSteps = parsePositiveInteger(arg.slice('--max-steps='.length), '--max-steps');
      continue;
    }

    if (arg === '--tools') {
      toolMode = parseToolMode(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--tools=')) {
      toolMode = parseToolMode(arg.slice('--tools='.length));
      continue;
    }

    if (arg === '--continue') {
      continueLatest = true;
      continue;
    }

    if (arg === '--cwd' || arg === '--project') {
      projectArg = requireValue(args[index + 1], arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--cwd=')) {
      projectArg = arg.slice('--cwd='.length);
      continue;
    }

    if (arg.startsWith('--project=')) {
      projectArg = arg.slice('--project='.length);
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown TUI option: ${arg}`);
    }

    projectArg = arg;
  }

  return { projectArg, agent, model, maxSteps, toolMode, continueLatest };
}

async function handleSlashCommand(line: string, state: TuiState, rl: Interface): Promise<boolean> {
  const [command = '', ...rest] = line.slice(1).split(/\s+/);
  const argText = rest.join(' ').trim();

  if (command === 'exit' || command === 'quit' || command === 'q') {
    return true;
  }

  if (command === 'help') {
    printPanel('Help', HELP_TEXT);
    return false;
  }

  if (command === 'new' || command === 'clear') {
    state.session = createTuiSession(state, argText || undefined);
    state.undone = undefined;
    printNotice('New session', state.session.id);
    return false;
  }

  if (command === 'sessions' || command === 'resume' || command === 'continue') {
    await chooseSession(state, rl);
    return false;
  }

  if (command === 'agent') {
    if (!argText) {
      printNotice('Agent', state.agent);
      return false;
    }
    state.agent = parseAgentName(argText);
    printNotice('Agent', state.agent);
    return false;
  }

  if (command === 'tab') {
    cycleAgent(state);
    printNotice('Agent', state.agent);
    return false;
  }

  if (command === 'tools') {
    if (!argText) {
      printNotice('Tools', state.toolMode);
      return false;
    }
    state.toolMode = parseToolMode(argText);
    printNotice('Tools', state.toolMode);
    return false;
  }

  if (command === 'model') {
    state.model = argText || undefined;
    printNotice('Model', state.model ?? 'default');
    return false;
  }

  if (command === 'max-steps') {
    if (!argText) {
      printNotice('Max steps', String(state.maxSteps ?? 'agent default'));
      return false;
    }
    state.maxSteps = parsePositiveInteger(argText, '/max-steps');
    printNotice('Max steps', String(state.maxSteps));
    return false;
  }

  if (command === 'details') {
    state.showDetails = !state.showDetails;
    printNotice('Details', state.showDetails ? 'on' : 'off');
    return false;
  }

  if (command === 'init') {
    await initAgentsFile(state.projectRoot);
    return false;
  }

  if (command === 'undo') {
    undoLastTurn(state);
    return false;
  }

  if (command === 'redo') {
    if (!state.undone) {
      printWarning('Nothing to redo.');
      return false;
    }
    const redo = state.undone;
    state.undone = undefined;
    state.agent = redo.agent;
    state.model = redo.model;
    state.maxSteps = redo.maxSteps;
    state.toolMode = redo.toolMode;
    await runPrompt(redo.prompt, state, rl);
    return false;
  }

  if (command === 'share' || command === 'export') {
    const filePath = await exportSessionMarkdown(state);
    printNotice('Exported', filePath);
    return false;
  }

  printWarning(`Unknown command: /${command}`);
  console.log(dim('Type /help for available commands.'));
  return false;
}

async function runPrompt(prompt: string, state: TuiState, rl: Interface): Promise<void> {
  const provider = createDeepSeekProvider({
    model: state.model,
  });

  console.log('');
  printRunHeader([
    ['session', state.session.id],
    ['agent', state.agent],
    ['tools', state.toolMode],
    ['model', state.model ?? provider.defaultModel],
  ]);
  console.log('');

  const runtime = new AgentRuntime();
  const result = await runtime.run({
    task: prompt,
    projectPath: state.projectRoot,
    provider,
    sessionId: state.session.id,
    agent: state.agent,
    model: state.model,
    maxSteps: state.maxSteps,
    toolMode: state.toolMode,
    title: prompt.slice(0, 80),
    onEvent: (event) => printTuiEvent(event, state),
    onPermissionRequest: (request) => askPermission(request, rl),
  });

  state.session = result.session;
  closeTextLine();
  console.log('');
  const statusText = `${result.status}; steps: ${result.steps}`;
  if (result.status === 'completed') {
    printNotice('Done', statusText);
  } else {
    printError(`Status: ${statusText}`);
  }
}

function printTuiEvent(event: AgentRuntimeEvent, state: TuiState): void {
  if (event.type === 'step-start') {
    closeTextLine();
    console.log(`\n${badge('step', 'cyan')} ${bold(`${event.step}/${event.maxSteps}`)}`);
    return;
  }

  if (event.type === 'assistant-text-delta') {
    process.stdout.write(event.text);
    textLineOpen = true;
    return;
  }

  if (event.type === 'tool-call-start') {
    closeTextLine();
    console.log(`${badge('tool', 'magenta')} ${event.tool} ${dim('input')}`);
    return;
  }

  if (event.type === 'tool-call') {
    closeTextLine();
    // 对于某些工具，默认显示输入
    const shouldShowInput = ['todowrite', 'plan', 'task'].includes(event.tool) || state.showDetails;
    const suffix = shouldShowInput ? ` ${truncate(JSON.stringify(event.input), 500)}` : '';
    console.log(`${badge('tool', 'magenta')} ${event.tool} ${dim('start')}${suffix}`);
    return;
  }

  if (event.type === 'permission-request') {
    closeTextLine();
    console.log(`${badge('permission', 'yellow')} ${event.request.permission} ${dim(event.request.pattern)}`);
    return;
  }

  if (event.type === 'permission-result') {
    closeTextLine();
    console.log(`${badge('permission', event.approved ? 'green' : 'red')} ${event.approved ? 'approved' : 'rejected'}`);
    return;
  }

  if (event.type === 'tool-result') {
    closeTextLine();

    // 特殊处理需要显示详细输出的工具
    const verboseTools = ['task', 'todowrite', 'plan'];

    if (verboseTools.includes(event.tool)) {
      if (event.tool === 'task') {
        const task = parseTaskToolOutput(event.output);
        const meta = task
          ? [
            task.status ?? 'completed',
            typeof task.steps === 'number' ? `${task.steps} step(s)` : undefined,
          ].filter(Boolean).join('; ')
          : 'done';
        console.log(`${badge('tool', 'green')} ${event.tool} ${dim(meta)}`);
        const output = task?.output?.trim();
        if (output) {
          console.log(output);
        }
      } else {
        // todowrite, plan 等工具显示完整输出
        console.log(`${badge('tool', 'green')} ${event.tool} ${dim('done')}`);
        const output = event.output.trim();
        if (output) {
          // 对于较长的输出，显示前 2000 字符
          const displayOutput = output.length > 2000 ? `${output.slice(0, 2000)}...\n${dim(`(${output.length} chars total, truncated)`)}` : output;
          console.log(displayOutput);
        }
      }
      return;
    }

    // 其他工具的默认处理
    const suffix = state.showDetails ? ` ${truncate(event.output.replace(/\s+/g, ' '), 700)}` : '';
    console.log(`${badge('tool', 'green')} ${event.tool} ${dim('done')}${suffix}`);
    return;
  }

  if (event.type === 'tool-error') {
    closeTextLine();
    console.log(`${badge('tool', 'red')} ${event.tool} ${event.error}`);
    return;
  }

  if (event.type === 'step-finish') {
    closeTextLine();
    console.log(`${badge('step', 'green')} ${event.step} ${dim(`finish${event.reason ? ` (${event.reason})` : ''}`)}`);
    return;
  }

  if (event.type === 'runtime-error') {
    closeTextLine();
    printError(event.error);
  }
}

let textLineOpen = false;

function closeTextLine(): void {
  if (textLineOpen) {
    process.stdout.write('\n');
    textLineOpen = false;
  }
}

async function askPermission(request: AgentPermissionRequest, rl: Interface): Promise<boolean> {
  closeTextLine();
  console.log('');
  printPanel('Permission required', [
    `Tool: ${request.tool}`,
    `Permission: ${request.permission}`,
    `Pattern: ${request.pattern}`,
    `Input: ${truncate(JSON.stringify(request.input), 500)}`,
  ].join('\n'));
  const answer = (await rl.question(`${yellow('Approve?')} ${dim('[y/N]')} `)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function createTuiSession(state: TuiState, title?: string): SessionInfo {
  const store = createStore(state.dbPath);
  try {
    return store.sessions().createSession({
      cwd: state.projectRoot,
      agent: state.agent,
      model: state.model,
      title,
    });
  } finally {
    store.close();
  }
}

async function chooseSession(state: TuiState, rl: Interface): Promise<void> {
  const store = createStore(state.dbPath);
  try {
    const sessions = store.sessions().listSessions(20);
    if (sessions.length === 0) {
      printWarning('No sessions.');
      return;
    }

    console.log(bold(cyan('Sessions')));
    sessions.forEach((session, index) => {
      const marker = session.id === state.session.id ? '*' : ' ';
      const status = session.status === 'completed' ? green(session.status) : yellow(session.status);
      console.log(`${dim(marker)} ${cyan(String(index + 1).padStart(2, ' '))}. ${session.id} ${session.title} ${dim('(')}${status}${dim(')')}`);
    });

    const answer = (await rl.question(`${cyan('Switch to session')} ${dim('number/id, Enter to cancel:')} `)).trim();
    if (!answer) {
      return;
    }

    const byIndex = Number(answer);
    const selected = Number.isInteger(byIndex) && byIndex > 0
      ? sessions[byIndex - 1]
      : sessions.find((session) => session.id === answer);
    if (!selected) {
      printWarning('Session not found.');
      return;
    }

    state.session = selected;
    state.agent = selected.agent;
    state.model = selected.model;
    printNotice('Session', state.session.id);
  } finally {
    store.close();
  }
}

function undoLastTurn(state: TuiState): void {
  const store = createStore(state.dbPath);
  try {
    const sessions = store.sessions();
    const messages = sessions.listMessages(state.session.id);
    const latestUserIndex = findLatestUserMessageIndex(messages);
    if (latestUserIndex < 0) {
      console.log('Nothing to undo.');
      return;
    }

    const latestUser = messages[latestUserIndex]!;
    const prompt = latestUser.parts
      .filter((part) => part.type === 'text' || part.type === 'reasoning')
      .map((part) => part.text)
      .join('\n')
      .trim();
    sessions.deleteMessagesFrom(state.session.id, latestUser.message.createdAt, latestUser.message.id);
    state.session = sessions.updateSessionStatus(state.session.id, 'idle') ?? state.session;
    state.undone = {
      prompt,
      agent: state.agent,
      model: state.model,
      maxSteps: state.maxSteps,
      toolMode: state.toolMode,
    };
    printNotice('Undo', 'latest turn removed; use /redo to run it again');
  } finally {
    store.close();
  }
}

function findLatestUserMessageIndex(messages: SessionMessageWithParts[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.message.role === 'user') {
      return index;
    }
  }
  return -1;
}

async function exportSessionMarkdown(state: TuiState): Promise<string> {
  const store = createStore(state.dbPath);
  try {
    const messages = store.sessions().listMessages(state.session.id);
    const lines = [
      `# CodeAgent Session ${state.session.id}`,
      '',
      `Project: ${state.projectRoot}`,
      `Title: ${state.session.title}`,
      '',
    ];

    for (const item of messages) {
      lines.push(`## ${item.message.role}`);
      lines.push('');
      for (const part of item.parts) {
        if (part.type === 'text' || part.type === 'reasoning') {
          lines.push(part.text.trim(), '');
        } else if (part.type === 'tool') {
          lines.push(`Tool: ${part.tool} (${part.status})`, '');
        } else if (part.type === 'error') {
          lines.push(`Error: ${part.message}`, '');
        }
      }
    }

    const shareDir = path.join(state.projectRoot, '.code-agent', 'share');
    await fsp.mkdir(shareDir, { recursive: true });
    const filePath = path.join(shareDir, `${state.session.id}.md`);
    await fsp.writeFile(filePath, `${lines.join('\n').trim()}\n`, 'utf8');
    return filePath;
  } finally {
    store.close();
  }
}

async function initAgentsFile(projectRoot: string): Promise<void> {
  const filePath = path.join(projectRoot, 'AGENTS.md');
  if (fs.existsSync(filePath)) {
    printNotice('AGENTS.md exists', filePath);
    return;
  }

  const content = [
    '# AGENTS.md',
    '',
    '## Project Instructions',
    '',
    '- Keep changes focused and consistent with the existing code style.',
    '- Prefer reading existing code before making edits.',
    '- Run relevant verification commands after code changes when available.',
    '',
  ].join('\n');
  await fsp.writeFile(filePath, content, 'utf8');
  printNotice('Created', filePath);
}

async function shellPrompt(projectRoot: string, command: string): Promise<string> {
  if (!command) {
    return 'No shell command was provided.';
  }

  const result = await runShell(projectRoot, command);
  return [
    `Shell command: ${command}`,
    '',
    `Exit code: ${result.exitCode}`,
    '',
    'stdout:',
    '```',
    result.stdout,
    '```',
    '',
    'stderr:',
    '```',
    result.stderr,
    '```',
    '',
    'Please use this shell output as context.',
  ].join('\n');
}

function runShell(cwd: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], { cwd });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      stdout = truncate(stdout, 64 * 1024);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      stderr = truncate(stderr, 64 * 1024);
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr });
    });
  });
}

function cycleAgent(state: TuiState): void {
  const agents: AgentName[] = ['build', 'plan', 'general', 'explore', 'scout', 'review', 'refactor', 'test', 'doc', 'debug'];
  const currentIndex = agents.indexOf(state.agent);
  const nextIndex = (currentIndex + 1) % agents.length;
  state.agent = agents[nextIndex];
}

function printBanner(state: TuiState): void {
  const width = terminalWidth();
  const title = `${bold(cyan('CodeAgent'))} ${dim('interactive terminal')}`;
  const rows = [
    title,
    `${dim('Project')} ${state.projectRoot}`,
    `${dim('Session')} ${state.session.id}`,
    `${dim('Agent')} ${state.agent}    ${dim('Tools')} ${state.toolMode}`,
    `${dim('Type')} ${cyan('/help')} ${dim('for commands,')} ${cyan('!command')} ${dim('to run shell,')} ${cyan('/exit')} ${dim('to quit')}`,
  ];
  console.log(box(rows, width));
}

function promptLabel(state: TuiState): string {
  const agent = state.agent === 'build' ? green(state.agent) : cyan(state.agent);
  return `${dim('code-agent')} ${agent}${dim('/')}${magenta(state.toolMode)} ${cyan('>')} `;
}

function parseAgentName(value: string | undefined): AgentName {
  if (value === 'build' || value === 'plan' || value === 'general' || value === 'explore' || value === 'scout' || value === 'review' || value === 'refactor' || value === 'test' || value === 'doc' || value === 'debug') {
    return value;
  }
  throw new Error(`Invalid agent: ${value ?? ''}. Expected one of: build, plan, general, explore, scout, review, refactor, test, doc, debug.`);
}

function parseToolMode(value: string | undefined): LocalToolMode {
  if (value === 'core' || value === 'full') {
    return value;
  }
  throw new Error(`Invalid tool mode: ${value ?? ''}. Expected "core" or "full".`);
}

function parsePositiveInteger(value: string | undefined, name: string): number {
  const raw = requireValue(value, name);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return parsed;
}

function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function printRunHeader(items: Array<[string, string]>): void {
  const text = items.map(([key, value]) => `${dim(key)} ${value}`).join(`  ${dim('|')}  `);
  console.log(`${badge('run', 'cyan')} ${text}`);
}

function printNotice(label: string, value: string): void {
  console.log(`${badge(label, 'green')} ${value}`);
}

function printWarning(message: string): void {
  console.log(`${badge('warn', 'yellow')} ${message}`);
}

function printError(message: string): void {
  console.log(`${badge('error', 'red')} ${message}`);
}

function printPanel(title: string, content: string): void {
  console.log(box([bold(cyan(title)), ...content.split('\n')], terminalWidth()));
}

function badge(text: string, colorName: 'cyan' | 'green' | 'yellow' | 'red' | 'magenta'): string {
  const label = ` ${text} `;
  const colored = colorName === 'cyan'
    ? cyan(label)
    : colorName === 'green'
      ? green(label)
      : colorName === 'yellow'
        ? yellow(label)
        : colorName === 'red'
          ? red(label)
          : magenta(label);
  return `${dim('[')}${colored}${dim(']')}`;
}

function box(lines: string[], width: number): string {
  const innerWidth = Math.max(48, Math.min(width - 4, 96));
  const top = `${dim('+')}${dim('-'.repeat(innerWidth + 2))}${dim('+')}`;
  const bottom = top;
  const body = lines.flatMap((line) => wrapVisible(line, innerWidth)).map((line) => {
    const padding = Math.max(0, innerWidth - visibleLength(line));
    return `${dim('|')} ${line}${' '.repeat(padding)} ${dim('|')}`;
  });
  return [top, ...body, bottom].join('\n');
}

function wrapVisible(line: string, width: number): string[] {
  if (visibleLength(line) <= width) {
    return [line];
  }

  const stripped = stripAnsi(line);
  const chunks: string[] = [];
  for (let index = 0; index < stripped.length; index += width) {
    chunks.push(stripped.slice(index, index + width));
  }
  return chunks;
}

function terminalWidth(): number {
  return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 100;
}

function style(value: string, code: string): string {
  return colorEnabled ? `${code}${value}${ansi.reset}` : value;
}

function bold(value: string): string {
  return style(value, ansi.bold);
}

function dim(value: string): string {
  return style(value, ansi.dim);
}

function cyan(value: string): string {
  return style(value, ansi.cyan);
}

function green(value: string): string {
  return style(value, ansi.green);
}

function yellow(value: string): string {
  return style(value, ansi.yellow);
}

function red(value: string): string {
  return style(value, ansi.red);
}

function magenta(value: string): string {
  return style(value, ansi.magenta);
}

function visibleLength(value: string): number {
  return stripAnsi(value).length;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function loadLocalEnv(projectRoot: string): void {
  const home = process.env.HOME;
  if (home) {
    loadDotEnvFile(path.join(home, '.code-agent', '.env'));
    loadDotEnvFile(path.join(home, '.config', 'code-agent', '.env'));
  }
  loadDotEnvFile(path.join(projectRoot, '.env'));
  loadDotEnvFile(path.join(process.cwd(), '.env'));
}

function loadDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key!] === undefined) {
      process.env[key!] = unquoteEnvValue(rawValue ?? '');
    }
  }
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
