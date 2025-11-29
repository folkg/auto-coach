import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./test/msw-server.js";

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock Firebase/Firestore
const mockFirestore = {
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
};

vi.mock("firebase-admin/firestore", () => ({
  Firestore: vi.fn().mockImplementation(() => mockFirestore),
}));

// Mock Google Cloud Firestore
vi.mock("@google-cloud/firestore", () => ({
  Firestore: vi.fn().mockImplementation(() => mockFirestore),
}));

// Mock Google Cloud Tasks
vi.mock("@google-cloud/tasks", () => ({
  CloudTasksClient: vi.fn().mockImplementation(() => ({
    queuePath: vi.fn().mockReturnValue("projects/test/locations/us-central1/queues/test-queue"),
    taskPath: vi
      .fn()
      .mockReturnValue("projects/test/locations/us-central1/queues/test-queue/tasks/test-task"),
    createTask: vi.fn().mockResolvedValue({}),
    deleteTask: vi.fn().mockResolvedValue({}),
  })),
}));

// Note: We do NOT mock the "effect" module as it breaks TaggedError functionality
// and path resolution in dependent modules. The real Effect library should be used.

// Global test setup
global.console = {
  ...console,
  // Suppress console.log in tests unless needed
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
