import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { PlaygroundPreview } from '../docs/src/client/playground-preview';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('cancels both a queued preview and its preset lock', async () => {
  const run = vi.fn().mockResolvedValue(undefined);
  const previews = new PlaygroundPreview({ isBusy: () => false, run, onChange: vi.fn(), onError: vi.fn() });
  previews.schedule(true);
  expect(previews.presetPending).toBe(true);
  previews.cancel();
  expect(previews.presetPending).toBe(false);
  await vi.runAllTimersAsync();
  expect(run).not.toHaveBeenCalled();
  previews.schedule(true);
  await vi.advanceTimersByTimeAsync(240);
  expect(run).toHaveBeenCalledTimes(1);
  expect(previews.presetPending).toBe(false);
});

it('waits for the active preview to finish reinserting its card before running the latest settings', async () => {
  let finish!: () => void;
  let value = 'dust';
  const observed: string[] = [];
  const run = vi.fn(() => {
    observed.push(value);
    return observed.length === 1
      ? new Promise<void>((resolve) => {
          finish = resolve;
        })
      : Promise.resolve();
  });
  const previews = new PlaygroundPreview({ isBusy: () => false, run, onChange: vi.fn(), onError: vi.fn() });
  previews.schedule();
  await vi.advanceTimersByTimeAsync(240);
  value = 'vapor';
  previews.schedule(true);
  value = 'scatter';
  previews.schedule(true);
  await vi.advanceTimersByTimeAsync(240);
  previews.resume();
  expect(observed).toEqual(['dust']);
  expect(previews.presetPending).toBe(true);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(observed).toEqual(['dust', 'scatter']);
  expect(previews.presetPending).toBe(false);
});

it('resumes after a manual operation and handles failed previews without stale locks', async () => {
  let busy = true;
  const failure = new Error('preview failed');
  const onError = vi.fn();
  const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
  const previews = new PlaygroundPreview({ isBusy: () => busy, run, onChange: vi.fn(), onError });
  previews.schedule(true);
  await vi.advanceTimersByTimeAsync(240);
  expect(run).not.toHaveBeenCalled();
  busy = false;
  previews.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(onError).toHaveBeenCalledWith(failure);
  expect(previews.presetPending).toBe(false);
  previews.schedule();
  previews.dispose();
  previews.schedule(true);
  await vi.runAllTimersAsync();
  expect(run).toHaveBeenCalledTimes(1);
});
