import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import readline from 'node:readline';
import { createInterface, Interface } from 'node:readline/promises';
import { AgentName } from '../agent';
import { createDeepSeekProvider } from '../provider';
import { createStore, ensureStateDir, resolveProjectPaths } from '../project';
import { AgentPermissionRequest, AgentRuntime, AgentRuntimeEvent } from '../runtime';
import { SessionInfo, SessionMessageWithParts } from '../session';
import { LocalToolMode, closeBrowserSession } from '../tool';
import {
  completeFileReferenceLine,
  formatFileSuggestionRows,
  moveFileReferenceSelection,
  parseProjectFilesOutput,
  prepareSelectedFileReferenceInput,
  projectFilesCommand,
  scoreFiles,
  suggestFileReferences,
} from '../utils/file-references';
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
  fileReferenceFiles?: string[];
  liveFileSuggestionSignature?: string;
  liveFileSuggestionVisible?: boolean;
  liveFileSuggestions?: string[];
  liveFileSuggestionQuery?: string;
  liveFileSuggestionSelectedIndex?: number;
  liveFileSuggestionRowCount?: number;
  pendingInputLine?: string;
  skipNextSubmittedLine?: boolean;
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
  '  /agent [build|plan]      Show or change agent',
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
  '  @file                    Open a file picker and attach selected file content',
  '  @file:query              Fuzzy match a file and attach its content',
  '  @path/or/name            Attach matching file contents to your message',
  '  !command                 Run a shell command and send its output as context',
  '  Tab on empty prompt      Switch between build and plan',
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
    completer: (line: string) => completeInput(paths.root, line),
  });

  const uninstallInputKeyHandlers = installInputKeyHandlers(rl, state);
  printBanner(state);

  try {
    while (true) {
      const line = (await questionWithPrefill(rl, promptLabel(state), state.pendingInputLine)).trim();
      state.pendingInputLine = undefined;
      if (state.skipNextSubmittedLine) {
        state.skipNextSubmittedLine = false;
        if (line) {
          state.pendingInputLine = line;
        }
        continue;
      }

      if (!line) {
        continue;
      }

      if (line.startsWith('/')) {
        clearLiveFileSuggestions(state, rl);
        const shouldExit = await handleSlashCommand(line, state, rl);
        if (shouldExit) {
          break;
        }
        continue;
      }

      const prompt = line.startsWith('!')
        ? await shellPrompt(state.projectRoot, line.slice(1).trim())
        : await expandFileReferences(state.projectRoot, line, rl);
      clearLiveFileSuggestions(state, rl);
      await runPrompt(prompt, state, rl);
    }
  } finally {
    uninstallInputKeyHandlers();
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
    const suffix = state.showDetails ? ` ${truncate(JSON.stringify(event.input), 500)}` : '';
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
      return;
    }

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
    state.undone = undefined;
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

async function expandFileReferences(projectRoot: string, input: string, rl: Interface): Promise<string> {
  const refs = Array.from(new Set(input.match(/@[^@\s]*/g) ?? []))
    .map((token) => token.slice(1))
    .filter((token) => token.length > 0);
  if (refs.length === 0) {
    return input;
  }

  const attachments: string[] = [];
  for (const ref of refs) {
    const filePath = await resolveFileToken(projectRoot, ref, rl);
    if (!filePath) {
      attachments.push(`File reference not found: @${ref}`);
      continue;
    }

    const content = await readTextFileLimited(path.join(projectRoot, filePath), 48 * 1024);
    attachments.push([
      `File: ${filePath}`,
      '```',
      content,
      '```',
    ].join('\n'));
  }

  return `${input}\n\nAttached file context:\n\n${attachments.join('\n\n')}`;
}

async function resolveFileToken(projectRoot: string, ref: string, rl: Interface): Promise<string | undefined> {
  if (ref === 'file') {
    return chooseFileReference(projectRoot, rl);
  }

  if (ref.startsWith('file:')) {
    const query = ref.slice('file:'.length).trim();
    if (!query) {
      return chooseFileReference(projectRoot, rl);
    }
    return resolveFileReference(projectRoot, query);
  }

  return resolveFileReference(projectRoot, ref);
}

async function chooseFileReference(projectRoot: string, rl: Interface): Promise<string | undefined> {
  const query = (await rl.question(`${cyan('Attach file')} ${dim('search:')} `)).trim();
  if (!query) {
    printWarning('File attach cancelled.');
    return undefined;
  }

  const matches = await searchFileReferences(projectRoot, query, 10);
  if (matches.length === 0) {
    printWarning(`No files matched: ${query}`);
    return undefined;
  }

  console.log(bold(cyan('File matches')));
  matches.forEach((file, index) => {
    console.log(`  ${cyan(String(index + 1).padStart(2, ' '))}. ${file}`);
  });

  const answer = (await rl.question(`${cyan('Select file')} ${dim('[1]:')} `)).trim();
  if (!answer) {
    printNotice('Attached', matches[0]!);
    return matches[0];
  }

  const selectedIndex = Number(answer);
  if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= matches.length) {
    const selected = matches[selectedIndex - 1]!;
    printNotice('Attached', selected);
    return selected;
  }

  const direct = matches.find((file) => file === answer) ?? await resolveFileReference(projectRoot, answer);
  if (direct) {
    printNotice('Attached', direct);
    return direct;
  }

  printWarning('Invalid file selection.');
  return undefined;
}

async function resolveFileReference(projectRoot: string, query: string): Promise<string | undefined> {
  const normalized = query.replace(/^file:\/\//, '');
  const direct = path.isAbsolute(normalized)
    ? normalized
    : path.join(projectRoot, normalized);
  if (direct.startsWith(projectRoot) && fs.existsSync(direct) && fs.statSync(direct).isFile()) {
    return path.relative(projectRoot, direct).replace(/\\/g, '/');
  }

  return (await searchFileReferences(projectRoot, query, 1))[0];
}

async function searchFileReferences(projectRoot: string, query: string, limit: number): Promise<string[]> {
  const files = await listProjectFiles(projectRoot);
  return scoreFiles(files, query, limit);
}

function completeInput(projectRoot: string, line: string): [string[], string] {
  const slash = /^\/([^\s]*)$/.exec(line);
  if (slash) {
    const commands = [
      '/help',
      '/exit',
      '/new',
      '/sessions',
      '/agent',
      '/tools',
      '/model',
      '/max-steps',
      '/details',
      '/init',
      '/undo',
      '/redo',
      '/share',
    ];
    return [commands.filter((command) => command.startsWith(line)), line];
  }

  const at = /@([^@\s]*)$/.exec(line);
  if (!at) {
    return [[], line];
  }

  try {
    return [completeFileReferenceLine(line, listProjectFilesSync(projectRoot), 30), line];
  } catch {
    return [[], line];
  }
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

function installInputKeyHandlers(rl: Interface, state: TuiState): () => void {
  readline.emitKeypressEvents(process.stdin, rl);
  if (!process.stdin.isTTY) {
    return () => {};
  }

  const previousRawMode = process.stdin.isRaw;
  process.stdin.setRawMode(true);

  const onKeypress = (_text: string | undefined, key: readline.Key | undefined): void => {
    if (key?.ctrl && key.name === 'c') {
      clearLiveFileSuggestions(state, rl);
      process.stdin.setRawMode(previousRawMode);
      console.log('');
      process.kill(process.pid, 'SIGINT');
      return;
    }

    if (key?.name === 'return' && acceptLiveFileSuggestion(rl, state, false)) {
      return;
    }

    if (key?.name === 'tab' && acceptLiveFileSuggestion(rl, state, true)) {
      return;
    }

    if (key?.name === 'return') {
      clearLiveFileSuggestions(state, rl);
      return;
    }

    if (key?.name === 'tab') {
      if (rl.line.trim().length === 0) {
        clearLiveFileSuggestions(state, rl);
        cycleAgent(state);
        console.log(`\n${badge('agent', 'cyan')} ${state.agent}`);
        rl.prompt();
      }
      return;
    }

    if (key?.name === 'up' && moveLiveFileSuggestionSelection(state, -1)) {
      renderLiveFileSuggestions(rl, state, { force: true });
      return;
    }

    if (key?.name === 'down' && moveLiveFileSuggestionSelection(state, 1)) {
      renderLiveFileSuggestions(rl, state, { force: true });
      return;
    }

    setImmediate(() => renderLiveFileSuggestions(rl, state));
  };

  process.stdin.on('keypress', onKeypress);

  return () => {
    process.stdin.off('keypress', onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(previousRawMode);
    }
  };
}

function cycleAgent(state: TuiState): void {
  state.agent = state.agent === 'build' ? 'plan' : 'build';
}

function renderLiveFileSuggestions(rl: Interface, state: TuiState, options: { force?: boolean } = {}): void {
  if (!process.stdout.isTTY) {
    return;
  }

  const result = suggestFileReferences(rl.line, getCachedProjectFiles(state), 8);
  if (!result) {
    clearLiveFileSuggestions(state, rl);
    state.liveFileSuggestionSignature = undefined;
    state.liveFileSuggestions = undefined;
    state.liveFileSuggestionQuery = undefined;
    state.liveFileSuggestionSelectedIndex = undefined;
    return;
  }

  const previousQuery = state.liveFileSuggestionQuery;
  state.liveFileSuggestions = result.suggestions;
  state.liveFileSuggestionQuery = result.query;
  if (previousQuery !== result.query || state.liveFileSuggestionSelectedIndex === undefined) {
    state.liveFileSuggestionSelectedIndex = 0;
  }
  if (result.suggestions.length > 0) {
    state.liveFileSuggestionSelectedIndex = Math.min(state.liveFileSuggestionSelectedIndex, result.suggestions.length - 1);
  }

  const signature = `${result.query}\u0000${result.suggestions.join('\u0000')}`;
  if (!options.force && signature === state.liveFileSuggestionSignature) {
    return;
  }
  state.liveFileSuggestionSignature = signature;

  const rows = formatFileSuggestionRows(
    result.query,
    result.suggestions,
    state.liveFileSuggestionSelectedIndex ?? 0,
    terminalWidth() - 1,
    8
  ).map((row, index) => index === 0 ? dim(row) : row);
  drawLiveFileSuggestions(rl, state, rows);
}

function moveLiveFileSuggestionSelection(state: TuiState, delta: number): boolean {
  const suggestions = state.liveFileSuggestions ?? [];
  if (!state.liveFileSuggestionVisible || suggestions.length === 0) {
    return false;
  }

  state.liveFileSuggestionSelectedIndex = moveFileReferenceSelection(
    state.liveFileSuggestionSelectedIndex ?? 0,
    delta,
    suggestions.length
  );
  return true;
}

function acceptLiveFileSuggestion(rl: Interface, state: TuiState, shouldSubmit: boolean): boolean {
  const suggestions = state.liveFileSuggestions ?? [];
  if (!state.liveFileSuggestionVisible || suggestions.length === 0) {
    return false;
  }

  const selected = suggestions[state.liveFileSuggestionSelectedIndex ?? 0];
  if (!selected) {
    return false;
  }

  const nextInput = prepareSelectedFileReferenceInput(rl.line, selected, shouldSubmit);
  rl.write('', { ctrl: true, name: 'u' });
  rl.write(nextInput.line);
  if (!nextInput.shouldSubmit) {
    state.pendingInputLine = nextInput.line;
    state.skipNextSubmittedLine = true;
  }
  clearLiveFileSuggestions(state, rl);
  return true;
}

function questionWithPrefill(rl: Interface, query: string, prefill: string | undefined): Promise<string> {
  const answer = rl.question(query);
  if (prefill) {
    setImmediate(() => rl.write(prefill));
  }
  return answer;
}

function getCachedProjectFiles(state: TuiState): string[] {
  state.fileReferenceFiles ??= listProjectFilesSync(state.projectRoot);
  return state.fileReferenceFiles;
}

function drawLiveFileSuggestions(rl: Interface, state: TuiState, rows: string[]): void {
  clearRenderedLiveFileSuggestionLine(rl, state);
  for (const row of rows) {
    process.stdout.write('\n');
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
    process.stdout.write(row);
  }
  readline.cursorTo(process.stdout, 0);
  readline.moveCursor(process.stdout, 0, -rows.length);
  refreshReadlineLine(rl);
  state.liveFileSuggestionVisible = true;
  state.liveFileSuggestionRowCount = rows.length;
}

function clearLiveFileSuggestions(state: TuiState, rl?: Interface): void {
  clearRenderedLiveFileSuggestionLine(rl, state);
  state.liveFileSuggestionSignature = undefined;
  state.liveFileSuggestions = undefined;
  state.liveFileSuggestionQuery = undefined;
  state.liveFileSuggestionSelectedIndex = undefined;
  state.liveFileSuggestionRowCount = undefined;
}

function clearRenderedLiveFileSuggestionLine(rl: Interface | undefined, state: TuiState): void {
  if (!state.liveFileSuggestionVisible || !process.stdout.isTTY) {
    return;
  }

  const rowCount = state.liveFileSuggestionRowCount ?? 1;
  for (let index = 0; index < rowCount; index += 1) {
    process.stdout.write('\n');
    readline.cursorTo(process.stdout, 0);
    readline.clearLine(process.stdout, 0);
  }
  readline.cursorTo(process.stdout, 0);
  readline.moveCursor(process.stdout, 0, -rowCount);
  if (rl) {
    refreshReadlineLine(rl);
  }
  state.liveFileSuggestionVisible = false;
  state.liveFileSuggestionRowCount = undefined;
}

function refreshReadlineLine(rl: Interface): void {
  const refresh = (rl as unknown as { _refreshLine?: () => void })._refreshLine;
  if (refresh) {
    refresh.call(rl);
  }
}

function printBanner(state: TuiState): void {
  const width = terminalWidth();
  const title = `${bold(cyan('CodeAgent'))} ${dim('interactive terminal')}`;
  const rows = [
    title,
    `${dim('Project')} ${state.projectRoot}`,
    `${dim('Session')} ${state.session.id}`,
    `${dim('Agent')} ${state.agent}    ${dim('Tools')} ${state.toolMode}`,
    `${dim('Type')} ${cyan('/help')} ${dim('for commands,')} ${cyan('@file')} ${dim('to attach files,')} ${cyan('/exit')} ${dim('to quit')}`,
  ];
  console.log(box(rows, width));
}

function promptLabel(state: TuiState): string {
  const agent = state.agent === 'build' ? green(state.agent) : cyan(state.agent);
  return `${dim('code-agent')} ${agent}${dim('/')}${magenta(state.toolMode)} ${cyan('>')} `;
}

function parseAgentName(value: string | undefined): AgentName {
  if (value === 'build' || value === 'plan') {
    return value;
  }
  throw new Error(`Invalid agent: ${value ?? ''}. Expected "build" or "plan".`);
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

async function listProjectFiles(projectRoot: string): Promise<string[]> {
  const result = await runShell(projectRoot, projectFilesCommand());
  return parseProjectFilesOutput(result.stdout);
}

function listProjectFilesSync(projectRoot: string): string[] {
  const result = spawnSyncText(projectRoot, projectFilesCommand());
  return parseProjectFilesOutput(result);
}

function spawnSyncText(cwd: string, command: string): string {
  const child = spawnSync('/bin/sh', ['-lc', command], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return child.stdout ?? '';
}

async function readTextFileLimited(filePath: string, maxBytes: number): Promise<string> {
  const content = await fsp.readFile(filePath, 'utf8');
  return truncate(content, maxBytes);
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
