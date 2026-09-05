import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PlaygroundPreview } from '../docs/src/client/playground-preview';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('interrupts immediately but debounces the replacement using the latest settings', async () => {
  const interrupt = vi.fn();
  let value = 'dust';
  const observed: string[] = [];
  const run = vi.fn(() => {
    observed.push(value);
    return Promise.resolve();
  });
  const previews = new PlaygroundPreview({ isBusy: () => false, interrupt, run, onChange: vi.fn(), onError: vi.fn() });
  previews.schedule();
  expect(interrupt).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(200);
  value = 'scatter';
  previews.schedule();
  expect(interrupt).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(239);
  expect(run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(observed).toEqual(['scatter']);
});

it('waits for cancelled preview cleanup before starting its replacement', async () => {
  let finish!: () => void;
  let cancel!: () => void;
  let value = 'dust';
  const observed: string[] = [];
  const interrupted = new Promise<void>((resolve) => {
    cancel = resolve;
  });
  const cleanup = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const interrupt = vi.fn(() => {
    if (observed.length > 0) cancel();
  });
  const run = vi.fn(async () => {
    observed.push(value);
    if (observed.length === 1) {
      await interrupted;
      await cleanup;
    }
  });
  const previews = new PlaygroundPreview({ isBusy: () => false, interrupt, run, onChange: vi.fn(), onError: vi.fn() });
  previews.schedule();
  await vi.advanceTimersByTimeAsync(240);
  value = 'vapor';
  previews.schedule();
  value = 'scatter';
  previews.schedule();
  await vi.advanceTimersByTimeAsync(240);
  expect(observed).toEqual(['dust']);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(observed).toEqual(['dust', 'scatter']);
});

it('cancels pending work when a manual action replaces it and never resumes after disposal', async () => {
  const interrupt = vi.fn();
  const run = vi.fn().mockResolvedValue(undefined);
  const previews = new PlaygroundPreview({ isBusy: () => false, interrupt, run, onChange: vi.fn(), onError: vi.fn() });
  previews.schedule();
  previews.cancel();
  await vi.runAllTimersAsync();
  expect(run).not.toHaveBeenCalled();
  expect(interrupt).toHaveBeenCalledTimes(2);
  previews.schedule();
  previews.dispose();
  previews.schedule();
  await vi.runAllTimersAsync();
  expect(run).not.toHaveBeenCalled();
});

it('recovers after a failed preview and waits for a manual operation to finish', async () => {
  let busy = true;
  const failure = new Error('preview failed');
  const onError = vi.fn();
  const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
  const previews = new PlaygroundPreview({ isBusy: () => busy, interrupt: vi.fn(), run, onChange: vi.fn(), onError });
  previews.schedule();
  await vi.advanceTimersByTimeAsync(240);
  expect(run).not.toHaveBeenCalled();
  busy = false;
  previews.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(onError).toHaveBeenCalledWith(failure);
  previews.schedule();
  await vi.advanceTimersByTimeAsync(240);
  expect(run).toHaveBeenCalledTimes(2);
});
