import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock the browser libraries so getBrowser()/ensureBrowserConnectivity() logic can be
// exercised without launching a real browser. Follows the project convention of mocking
// the fetcher's collaborators rather than flipping a global TEST_MODE.
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  launch: vi.fn(),
  launchOptions: vi.fn(),
}));

vi.mock('playwright-core', () => ({
  firefox: { connect: mocks.connect, launch: mocks.launch },
}));

vi.mock('camoufox-js', () => ({
  launchOptions: mocks.launchOptions,
}));

interface FakeBrowser {
  on: (event: string, cb: () => void) => void;
  emitDisconnect: () => void;
  isConnected: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function makeFakeBrowser(): FakeBrowser {
  const emitter = new EventEmitter();
  return {
    on: (event, cb) => {
      emitter.on(event, cb);
    },
    emitDisconnect: () => {
      emitter.emit('disconnected');
    },
    isConnected: vi.fn(() => true),
    close: vi.fn(async () => {}),
  };
}

const ENDPOINT = 'ws://camoufox:9222/reading-notifs';
const ORIGINAL_ENDPOINT = process.env.CAMOUFOX_WS_ENDPOINT;

async function importFetcher() {
  return import('../../src/fetchers/stealth.js');
}

beforeEach(() => {
  vi.resetModules();
  mocks.connect.mockReset();
  mocks.launch.mockReset();
  mocks.launchOptions.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  if (ORIGINAL_ENDPOINT === undefined) delete process.env.CAMOUFOX_WS_ENDPOINT;
  else process.env.CAMOUFOX_WS_ENDPOINT = ORIGINAL_ENDPOINT;
});

describe('StealthFetcher getBrowser / ensureBrowserConnectivity', () => {
  it('remote mode: connects directly to the full WS URL with a 10s timeout (no /json fetch)', async () => {
    process.env.CAMOUFOX_WS_ENDPOINT = ENDPOINT;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    mocks.connect.mockResolvedValue(makeFakeBrowser());

    const { ensureBrowserConnectivity } = await importFetcher();
    await ensureBrowserConnectivity();

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledWith(ENDPOINT, { timeout: 10_000 });
    expect(mocks.launch).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('local fallback: launches in-process with camoufox launchOptions when the env var is unset', async () => {
    delete process.env.CAMOUFOX_WS_ENDPOINT;
    const opts = { headless: true, foo: 'bar' };
    mocks.launchOptions.mockResolvedValue(opts);
    mocks.launch.mockResolvedValue(makeFakeBrowser());

    const { ensureBrowserConnectivity } = await importFetcher();
    await ensureBrowserConnectivity();

    expect(mocks.launchOptions).toHaveBeenCalledWith({ headless: true });
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    expect(mocks.launch).toHaveBeenCalledWith(opts);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('disconnect recovery: a disconnect event nulls the cache and the next call reconnects', async () => {
    process.env.CAMOUFOX_WS_ENDPOINT = ENDPOINT;
    const browser = makeFakeBrowser();
    mocks.connect.mockResolvedValue(browser);

    const { ensureBrowserConnectivity } = await importFetcher();
    await ensureBrowserConnectivity();
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    browser.emitDisconnect();
    await ensureBrowserConnectivity();

    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });

  it('fail-fast: a connect rejection propagates immediately with no retry', async () => {
    process.env.CAMOUFOX_WS_ENDPOINT = ENDPOINT;
    mocks.connect.mockRejectedValue(new Error('ECONNREFUSED'));

    const { ensureBrowserConnectivity } = await importFetcher();
    await expect(ensureBrowserConnectivity()).rejects.toThrow('ECONNREFUSED');
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('connect timeout: a never-settling connect rejects within ~10s instead of hanging', async () => {
    process.env.CAMOUFOX_WS_ENDPOINT = ENDPOINT;
    vi.useFakeTimers();
    // Simulates a TCP-reachable but WS-unresponsive sidecar: connect never settles.
    mocks.connect.mockReturnValue(new Promise(() => {}));

    const { ensureBrowserConnectivity } = await importFetcher();
    const pending = ensureBrowserConnectivity();
    const assertion = expect(pending).rejects.toThrow(/did not complete within 10000ms/);

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('close(): closes the browser and nulls the cache so the next call reconnects', async () => {
    process.env.CAMOUFOX_WS_ENDPOINT = ENDPOINT;
    const browser = makeFakeBrowser();
    mocks.connect.mockResolvedValue(browser);

    const { ensureBrowserConnectivity, StealthFetcher } = await importFetcher();
    await ensureBrowserConnectivity();
    expect(mocks.connect).toHaveBeenCalledTimes(1);

    await new StealthFetcher().close();
    expect(browser.close).toHaveBeenCalledTimes(1);

    // Cache was nulled — a subsequent connectivity check establishes a fresh connection.
    await ensureBrowserConnectivity();
    expect(mocks.connect).toHaveBeenCalledTimes(2);
  });
});
