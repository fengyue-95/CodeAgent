import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Browser, Page, chromium } from 'playwright-core';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 512 * 1024;

export interface WebFetchArgs {
  url?: unknown;
  format?: unknown;
  timeoutMs?: unknown;
  maxBytes?: unknown;
}

export interface WebSearchArgs {
  query?: unknown;
  limit?: unknown;
  engine?: unknown;
  headless?: unknown;
  timeoutMs?: unknown;
}

export interface BrowserNavigateArgs {
  url?: unknown;
  waitUntil?: unknown;
  headless?: unknown;
  timeoutMs?: unknown;
}

export interface BrowserContentArgs {
  format?: unknown;
  maxBytes?: unknown;
}

export interface BrowserScreenshotArgs {
  filePath?: unknown;
  fullPage?: unknown;
}

let browserSession: Promise<{ browser: Browser; page: Page; browserLabel: string }> | undefined;

export async function webFetch(args: WebFetchArgs): Promise<unknown> {
  const url = assertHttpUrl(args.url);
  const format = getFormat(args.format);
  const timeoutMs = getPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs');
  const maxBytes = getPositiveInteger(args.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        accept: format === 'html' ? 'text/html,*/*;q=0.8' : 'text/plain,text/html,*/*;q=0.8',
        'user-agent': 'code-agent/0.1',
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`Response too large: ${buffer.length} bytes`);
    }

    const raw = buffer.toString('utf8');
    const text = format === 'html' ? raw : htmlToText(raw);
    return {
      url,
      status: response.status,
      ok: response.ok,
      contentType,
      format,
      title: extractTitle(raw),
      text,
      bytes: buffer.length,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function webSearch(args: WebSearchArgs): Promise<unknown> {
  const query = assertString(args.query, 'query');
  const limit = getPositiveInteger(args.limit, 8, 'limit');
  const engine = getSearchEngine(args.engine);
  const headless = args.headless !== false;
  const timeoutMs = getPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs');
  const chromeExecutablePath = findChromeExecutable();
  const browser = await chromium.launch({
    headless,
    executablePath: chromeExecutablePath,
  });

  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);

    const searchUrl = searchEngineUrl(engine, query);
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await dismissConsent(page);
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);

    const results = await extractSearchResults(page, engine, limit);
    return {
      query,
      provider: 'playwright-chrome',
      engine,
      browser: chromeExecutablePath ? 'local-chrome' : 'playwright-chromium',
      url: page.url(),
      results,
      totalReturned: results.length,
    };
  } finally {
    await browser.close();
  }
}

export async function browserNavigate(args: BrowserNavigateArgs): Promise<unknown> {
  const url = assertHttpUrl(args.url);
  const timeoutMs = getPositiveInteger(args.timeoutMs, DEFAULT_TIMEOUT_MS, 'timeoutMs');
  const waitUntil = getWaitUntil(args.waitUntil);
  const session = await getBrowserSession(args.headless !== false, timeoutMs);
  session.page.setDefaultTimeout(timeoutMs);
  session.page.setDefaultNavigationTimeout(timeoutMs);
  const response = await session.page.goto(url, {
    waitUntil,
    timeout: timeoutMs,
  });

  return {
    url: session.page.url(),
    title: await session.page.title(),
    status: response?.status() ?? null,
    ok: response?.ok() ?? null,
    browser: session.browserLabel,
  };
}

export async function browserContent(args: BrowserContentArgs): Promise<unknown> {
  const session = await getBrowserSession();
  const format = getBrowserContentFormat(args.format);
  const maxBytes = getPositiveInteger(args.maxBytes, DEFAULT_MAX_BYTES, 'maxBytes');
  const content = format === 'html'
    ? await session.page.content()
    : await session.page.evaluate(() => document.body?.innerText ?? document.documentElement?.innerText ?? '');
  const truncated = truncateBytes(content, maxBytes);

  return {
    url: session.page.url(),
    title: await session.page.title(),
    format,
    text: truncated.value,
    truncated: truncated.truncated,
  };
}

export async function browserScreenshot(projectRoot: string, args: BrowserScreenshotArgs): Promise<unknown> {
  const session = await getBrowserSession();
  const requestedPath = typeof args.filePath === 'string' && args.filePath.trim()
    ? args.filePath
    : path.join('.code-agent', 'screenshots', `screenshot-${Date.now()}.png`);
  const absolutePath = resolveWorkspacePath(projectRoot, requestedPath);
  await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
  await session.page.screenshot({
    path: absolutePath,
    fullPage: args.fullPage === true,
  });

  return {
    url: session.page.url(),
    title: await session.page.title(),
    filePath: path.relative(projectRoot, absolutePath).replace(/\\/g, '/'),
    absolutePath,
  };
}

export async function closeBrowserSession(): Promise<unknown> {
  const session = browserSession ? await browserSession.catch(() => undefined) : undefined;
  browserSession = undefined;
  if (session?.browser.isConnected()) {
    await session.browser.close();
  }

  return {
    closed: true,
  };
}

function assertHttpUrl(value: unknown): string {
  const url = assertString(value, 'url');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('url must start with http:// or https://');
  }

  return url;
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing or invalid ${name}`);
  }

  return value;
}

function getFormat(value: unknown): 'text' | 'html' {
  if (value === undefined || value === null || value === 'text') {
    return 'text';
  }
  if (value === 'html') {
    return 'html';
  }

  throw new Error(`Invalid format: ${String(value)}`);
}

function getBrowserContentFormat(value: unknown): 'text' | 'html' {
  return getFormat(value);
}

function getWaitUntil(value: unknown): 'load' | 'domcontentloaded' | 'networkidle' | 'commit' {
  if (value === undefined || value === null) {
    return 'domcontentloaded';
  }
  if (value === 'load' || value === 'domcontentloaded' || value === 'networkidle' || value === 'commit') {
    return value;
  }

  throw new Error(`Invalid waitUntil: ${String(value)}`);
}

function getPositiveInteger(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${String(value)}`);
  }
  return parsed;
}

function getSearchEngine(value: unknown): 'google' | 'duckduckgo' | 'bing' {
  if (value === undefined || value === null || value === 'duckduckgo') {
    return 'duckduckgo';
  }
  if (value === 'google' || value === 'bing') {
    return value;
  }

  throw new Error(`Invalid engine: ${String(value)}`);
}

function searchEngineUrl(engine: 'google' | 'duckduckgo' | 'bing', query: string): string {
  const encoded = encodeURIComponent(query);
  if (engine === 'duckduckgo') {
    return `https://duckduckgo.com/?q=${encoded}`;
  }
  if (engine === 'bing') {
    return `https://www.bing.com/search?q=${encoded}`;
  }

  return `https://www.google.com/search?q=${encoded}`;
}

async function dismissConsent(page: import('playwright-core').Page): Promise<void> {
  const labels = [
    'Accept all',
    'I agree',
    'Agree',
    '同意',
    '全部接受',
  ];
  for (const label of labels) {
    const button = page.getByRole('button', { name: label }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => undefined);
      return;
    }
  }
}

async function extractSearchResults(
  page: import('playwright-core').Page,
  engine: 'google' | 'duckduckgo' | 'bing',
  limit: number
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  return page.evaluate(({ engine: selectedEngine, limit: maxResults }) => {
    function clean(value: string | null | undefined): string {
      return (value ?? '').replace(/\s+/g, ' ').trim();
    }

    function normalizeUrl(value: string): string {
      try {
        const url = new URL(value, window.location.href);
        const googleTarget = url.searchParams.get('url');
        if (googleTarget) {
          return googleTarget;
        }
        const duckTarget = url.searchParams.get('uddg');
        if (duckTarget) {
          return duckTarget;
        }
        return url.toString();
      } catch {
        return value;
      }
    }

    const results: Array<{ title: string; url: string; snippet: string }> = [];
    const seen = new Set<string>();
    const selectors = selectedEngine === 'google'
      ? ['a:has(h3)']
      : selectedEngine === 'bing'
        ? ['li.b_algo h2 a']
        : ['[data-testid="result-title-a"]', 'a[data-testid="result-title-a"]', 'article a[href]'];

    for (const selector of selectors) {
      for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>(selector))) {
        const title = clean(anchor.innerText || anchor.textContent);
        const href = normalizeUrl(anchor.href);
        if (!title || !href || seen.has(href)) {
          continue;
        }
        const container = anchor.closest('div, article, li') ?? anchor.parentElement;
        const snippet = clean(container?.textContent).replace(title, '').trim();
        seen.add(href);
        results.push({ title, url: href, snippet });
        if (results.length >= maxResults) {
          return results;
        }
      }
    }

    return results;
  }, { engine, limit });
}

function findChromeExecutable(): string | undefined {
  const candidates = [
    process.env.CODE_AGENT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function getBrowserSession(headless = true, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ browser: Browser; page: Page; browserLabel: string }> {
  if (!browserSession) {
    browserSession = createBrowserSession(headless, timeoutMs);
  }

  const session = await browserSession;
  if (session.browser.isConnected()) {
    return session;
  }

  browserSession = createBrowserSession(headless, timeoutMs);
  return browserSession;
}

async function createBrowserSession(headless: boolean, timeoutMs: number): Promise<{ browser: Browser; page: Page; browserLabel: string }> {
  const chromeExecutablePath = findChromeExecutable();
  const browser = await chromium.launch({
    headless,
    executablePath: chromeExecutablePath,
  });
  const page = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(timeoutMs);

  return {
    browser,
    page,
    browserLabel: chromeExecutablePath ? 'local-chrome' : 'playwright-chromium',
  };
}

function resolveWorkspacePath(projectRoot: string, requestedPath: string): string {
  const resolved = path.resolve(projectRoot, requestedPath);
  const relative = path.relative(projectRoot, resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolved;
  }

  throw new Error(`Path escapes project root: ${requestedPath}`);
}

function truncateBytes(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) {
    return { value, truncated: false };
  }

  return {
    value: buffer.subarray(0, maxBytes).toString('utf8'),
    truncated: true,
  };
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? htmlToText(match[1] ?? '') : undefined;
}

function htmlToText(value: string): string {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
