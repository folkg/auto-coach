import type { Firestore } from "firebase-admin/firestore";

import { createMock } from "@common/utilities/createMock.js";
import { Layer, Logger, LogLevel } from "effect";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./test/msw-server.js";

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Create a stable Firestore mock object that won't be reset
function createFirestoreMock() {
  return createMock<Firestore>({
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue({
          exists: false,
        }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      }),
      add: vi.fn().mockResolvedValue({ id: "test-id" }),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      get: vi.fn().mockResolvedValue({
        docs: [],
      }),
    }),
    settings: vi.fn().mockReturnValue(undefined),
  });
}

// Mock Firebase/Firestore - use a class-like constructor function
const sharedFirestoreMock = createFirestoreMock();

vi.mock("firebase-admin/app", () => ({
  getApps: () => [{ name: "test-app" }],
  initializeApp: () => ({ name: "test-app" }),
}));

vi.mock("firebase-admin/firestore", () => ({
  Firestore: function MockFirestore() {
    return sharedFirestoreMock;
  },
  getFirestore: () => sharedFirestoreMock,
}));

// Mock Google Cloud Firestore - use a class-like constructor function
vi.mock("@google-cloud/firestore", () => ({
  Firestore: function MockFirestore() {
    return createFirestoreMock();
  },
}));

// Mock Google Cloud Tasks - use a class-like constructor function
vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: function MockCloudTasksClient() {
    return {
      queuePath: () => "projects/test/locations/us-central1/queues/test-queue",
      taskPath: () => "projects/test/locations/us-central1/queues/test-queue/tasks/test-task",
      createTask: () => Promise.resolve({}),
      deleteTask: () => Promise.resolve({}),
    };
  },
}));

// Note: We do NOT mock the "effect" module as it breaks TaggedError functionality
// and path resolution in dependent modules. The real Effect library should be used.

/**
 * Silent logger for tests - captures log calls but doesn't output anything.
 * Use this to prevent test output pollution while still allowing log assertions.
 */
export const testLoggerCalls: Array<{
  level: string;
  message: unknown;
  annotations: Record<string, unknown>;
}> = [];

const silentTestLogger = Logger.make<unknown, void>(({ annotations, logLevel, message }) => {
  const annotationRecord: Record<string, unknown> = {};
  for (const [key, value] of annotations) {
    annotationRecord[key] = value;
  }
  testLoggerCalls.push({
    level: logLevel._tag,
    message,
    annotations: annotationRecord,
  });
});

/**
 * Test logger layer that suppresses output but captures calls.
 */
export const TestLoggerLayer = Layer.merge(
  Logger.replace(Logger.defaultLogger, silentTestLogger),
  Logger.minimumLogLevel(LogLevel.All),
);

/**
 * Clear captured test log calls between tests.
 */
export function clearTestLogCalls(): void {
  testLoggerCalls.length = 0;
}
