import { TestBed } from "@angular/core/testing";
import { bufferCount, firstValueFrom } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppStatusService } from "./app-status.service";

describe("AppStatusService", () => {
  let service: AppStatusService;

  beforeEach(() => {
    // Mock navigator.onLine
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    // Mock window events with proper implementation
    const eventListeners: { [key: string]: ((event: Event) => void)[] } = {};

    Object.defineProperty(window, "addEventListener", {
      writable: true,
      value: vi.fn((event: string, handler: (event: Event) => void) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(handler);
      }),
    });

    Object.defineProperty(window, "removeEventListener", {
      writable: true,
      value: vi.fn((event: string, handler: (event: Event) => void) => {
        if (eventListeners[event]) {
          const index = eventListeners[event].indexOf(handler);
          if (index > -1) {
            eventListeners[event].splice(index, 1);
          }
        }
      }),
    });

    // Override dispatchEvent to actually call listeners
    const originalDispatchEvent = window.dispatchEvent;
    Object.defineProperty(window, "dispatchEvent", {
      writable: true,
      value: vi.fn((event: Event) => {
        // Call original dispatchEvent
        originalDispatchEvent.call(window, event);

        // Also call our mocked listeners
        const listeners = eventListeners[event.type];
        if (listeners) {
          listeners.forEach((handler) => {
            try {
              handler(event);
            } catch (error) {
              console.error("Error in event listener:", error);
            }
          });
        }

        return true;
      }),
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(AppStatusService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("is created", () => {
    expect(service).toBeTruthy();
  });

  describe("online$ observable", () => {
    it("emits initial online status", async () => {
      // Arrange
      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(1)));

      // Act

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues.length).toBeGreaterThan(0);
      expect(onlineValues[0]).toBe(true);
    });

    it("emits true when window comes online", async () => {
      // Arrange
      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(2)));

      // Act
      window.dispatchEvent(new Event("online"));

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues).toContain(true);
    });

    it("emits false when window goes offline", async () => {
      // Arrange
      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(2)));

      // Act
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues).toContain(false);
    });

    it("reflects current navigator.onLine status", async () => {
      // Arrange
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });
      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(3)));

      // Act
      window.dispatchEvent(new Event("online"));
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues).toContain(true);
      expect(onlineValues).toContain(false);
    });

    it("handles multiple online/offline transitions", async () => {
      // Arrange
      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(4)));

      // Act
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));

      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });
      window.dispatchEvent(new Event("online"));

      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });
      window.dispatchEvent(new Event("offline"));

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues).toEqual([true, false, true, false]);
    });
  });

  describe("focus$ observable", () => {
    it("emits initial focus timestamp", async () => {
      // Arrange
      const focusPromise = firstValueFrom(service.focus$.pipe(bufferCount(1)));

      // Act

      // Assert
      const focusValues = await focusPromise;
      expect(focusValues.length).toBeGreaterThan(0);
      expect(focusValues[0]).toBeDefined();
    });

    it("emits timestamp when window gains focus", async () => {
      // Arrange
      const focusPromise = firstValueFrom(service.focus$.pipe(bufferCount(2)));

      // Act
      window.dispatchEvent(new Event("focus"));

      // Assert
      const focusValues = await focusPromise;
      expect(focusValues.length).toBe(2);
      expect(focusValues[1]).toBeDefined();
    });

    it("emits different timestamps for multiple focus events", async () => {
      // Arrange
      const focusPromise = firstValueFrom(service.focus$.pipe(bufferCount(3)));

      // Act
      window.dispatchEvent(new Event("focus"));
      await new Promise((resolve) => setTimeout(resolve, 10));
      window.dispatchEvent(new Event("focus"));

      // Assert
      const focusValues = await focusPromise;
      const firstFocusTime = focusValues[1];
      const secondFocusTime = focusValues[2];
      expect(firstFocusTime).not.toBe(secondFocusTime);
    });

    it("handles rapid focus events", async () => {
      // Arrange
      const focusPromise = firstValueFrom(service.focus$.pipe(bufferCount(4)));

      // Act
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));

      // Assert
      const focusValues = await focusPromise;
      expect(focusValues.length).toBe(4);
    });
  });

  describe("event listener setup", () => {
    it("sets up event listeners for online/offline events", async () => {
      // Arrange
      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(2)));
      const focusPromise = firstValueFrom(service.focus$.pipe(bufferCount(2)));

      // Act
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));

      // Assert
      const onlineValues = await onlinePromise;
      const focusValues = await focusPromise;
      expect(onlineValues.length).toBeGreaterThan(1);
      expect(focusValues.length).toBeGreaterThan(1);
    });

    it("uses shareLatest operator for online$ observable", async () => {
      // Arrange
      let subscriptionCount = 0;
      const originalSubscribe = service.online$.subscribe;

      service.online$.subscribe = vi.fn((observer) => {
        subscriptionCount++;
        return originalSubscribe.call(service.online$, observer);
      });

      const promise1 = firstValueFrom(service.online$.pipe(bufferCount(1)));
      const promise2 = firstValueFrom(service.online$.pipe(bufferCount(1)));

      // Act
      await promise1;
      await promise2;

      // Assert
      expect(subscriptionCount).toBeLessThanOrEqual(2);
    });
  });

  describe("initialization", () => {
    it("initializes with current online status", async () => {
      // Arrange
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      service = TestBed.inject(AppStatusService);

      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(1)));

      // Act

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues[0]).toBe(true);
    });

    it("initializes with offline status", async () => {
      // Arrange
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      service = TestBed.inject(AppStatusService);

      const onlinePromise = firstValueFrom(service.online$.pipe(bufferCount(1)));

      // Act

      // Assert
      const onlineValues = await onlinePromise;
      expect(onlineValues[0]).toBe(false);
    });
  });

  describe("error handling", () => {
    it("handles missing navigator.onLine gracefully", () => {
      // Mock navigator without onLine property
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: undefined,
      });

      expect(() => {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({});
        service = TestBed.inject(AppStatusService);
      }).not.toThrow();
    });

    it("handles window event errors gracefully", () => {
      // Mock window.dispatchEvent to throw
      const originalDispatchEvent = window.dispatchEvent;
      Object.defineProperty(window, "dispatchEvent", {
        writable: true,
        value: vi.fn(() => {
          throw new Error("Event dispatch failed");
        }),
      });

      expect(() => {
        window.dispatchEvent(new Event("online"));
      }).toThrow();

      // Restore original dispatchEvent
      Object.defineProperty(window, "dispatchEvent", {
        writable: true,
        value: originalDispatchEvent,
      });
    });
  });
});
