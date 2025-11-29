import { type MonoTypeOperatorFunction, ReplaySubject, share, timer } from "rxjs";

/**
 * Share the last emitted value from the source observable. useful for sharing between re-renders, but cleaning up once unused.
 * @param delay - Time in milliseconds to wait before unsubscribing from the source observable.
 */
export function shareLatest<T>(delay = 100): MonoTypeOperatorFunction<T> {
  return share<T>({
    connector: () => new ReplaySubject(1),
    resetOnError: true,
    resetOnComplete: false,
    resetOnRefCountZero: () => timer(delay),
  });
}
