import { singleFlight } from './singleFlight';

describe('singleFlight', () => {
  it('runs one call at a time and allows the next after it settles', async () => {
    let release: (() => void) | undefined;
    const task = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const run = singleFlight(task);

    run();
    run();
    expect(task).toHaveBeenCalledTimes(1);

    release?.();
    await Promise.resolve();
    await Promise.resolve();
    run();
    expect(task).toHaveBeenCalledTimes(2);
  });
});
