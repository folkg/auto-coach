import type { Firestore } from "@google-cloud/firestore";
import type { CloudTasksClient } from "@google-cloud/tasks";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MutationTaskService } from "./mutation-task.service.js";

interface MockFirestoreDocRef {
  readonly set: ReturnType<typeof vi.fn>;
}

interface MockFirestoreCollection {
  readonly doc: ReturnType<typeof vi.fn<(id: string) => MockFirestoreDocRef>>;
}

interface MockFirestore {
  readonly collection: ReturnType<
    typeof vi.fn<(name: string) => MockFirestoreCollection>
  >;
}

interface MockCloudTasksClient {
  readonly queuePath: ReturnType<typeof vi.fn>;
  readonly taskPath: ReturnType<typeof vi.fn>;
  readonly createTask: ReturnType<typeof vi.fn>;
  readonly deleteTask: ReturnType<typeof vi.fn>;
}

function setupMutationTaskService(): {
  readonly service: MutationTaskService;
  readonly mockFirestore: MockFirestore;
  readonly mockTasksClient: MockCloudTasksClient;
  readonly mockDocRef: MockFirestoreDocRef;
  readonly [Symbol.dispose]: () => void;
} {
  // Arrange - Mock Firestore
  const mockDocRef: MockFirestoreDocRef = {
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockCollection: MockFirestoreCollection = {
    doc: vi.fn().mockReturnValue(mockDocRef),
  };

  const mockFirestore: MockFirestore = {
    collection: vi.fn().mockReturnValue(mockCollection),
  };

  // Arrange - Mock Cloud Tasks Client
  const mockTasksClient: MockCloudTasksClient = {
    queuePath: vi
      .fn()
      .mockReturnValue("projects/test/locations/us-central1/queues/test-queue"),
    taskPath: vi
      .fn()
      .mockReturnValue(
        "projects/test/locations/us-central1/queues/test-queue/tasks/test-task",
      ),
    createTask: vi.fn().mockResolvedValue({}),
    deleteTask: vi.fn().mockResolvedValue({}),
  };

  // Arrange - Environment variables
  process.env.GOOGLE_CLOUD_PROJECT_ID = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.MUTATION_API_URL = "https://test-api.com";

  const service = new MutationTaskService(
    mockFirestore as unknown as Firestore,
    mockTasksClient as unknown as CloudTasksClient,
  );

  return {
    service,
    mockFirestore,
    mockTasksClient,
    mockDocRef,
    [Symbol.dispose]() {
      vi.clearAllMocks();
    },
  };
}

describe("MutationTaskService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createMutationTask", () => {
    it("creates a mutation task successfully", async () => {
      // Arrange
      using setup = setupMutationTaskService();
      const { service, mockFirestore, mockTasksClient, mockDocRef } = setup;
      const taskRequest = {
        type: "SET_LINEUP" as const,
        payload: { teamKey: "test.team.1" },
        userId: "test-user-123",
        queueName: "test-queue",
      };

      // Act
      const result = await Effect.runPromise(
        service.createMutationTask(taskRequest),
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.type).toBe("SET_LINEUP");
      expect(result.userId).toBe("test-user-123");
      expect(result.status).toBe("PENDING");
      expect(result.createdAt).toBeDefined();
      expect(mockFirestore.collection).toHaveBeenCalledWith("mutationTasks");
      expect(mockDocRef.set).toHaveBeenCalled();
      expect(mockTasksClient.createTask).toHaveBeenCalled();
    });

    it("handles task creation errors", async () => {
      // Arrange
      using setup = setupMutationTaskService();
      const { service, mockTasksClient } = setup;
      const taskRequest = {
        type: "SET_LINEUP" as const,
        payload: { teamKey: "test.team.1" },
        userId: "test-user-123",
        queueName: "test-queue",
      };
      mockTasksClient.createTask.mockRejectedValue(
        new Error("Cloud Tasks error"),
      );

      // Act
      const errorResult = await Effect.runPromise(
        Effect.flip(service.createMutationTask(taskRequest)),
      );

      // Assert
      expect(errorResult).toBeDefined();
      expect(errorResult._tag).toBe("MutationTaskError");
    });
  });

  describe("scheduleMutationTask", () => {
    it("schedules a mutation task for future date", async () => {
      // Arrange
      using setup = setupMutationTaskService();
      const { service } = setup;
      const taskRequest = {
        type: "SET_LINEUP" as const,
        payload: { uid: "test-user-123", teams: [] },
        userId: "test-user-123",
        queueName: "test-queue",
      };
      const scheduledFor = new Date(Date.now() + 60000);

      // Act
      const result = await Effect.runPromise(
        service.scheduleMutationTask(taskRequest, scheduledFor),
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.type).toBe("SET_LINEUP");
      expect(result.userId).toBe("test-user-123");
    });
  });

  describe("cancelMutationTask", () => {
    it("cancels a mutation task successfully", async () => {
      // Arrange
      using setup = setupMutationTaskService();
      const { service } = setup;
      const taskId = "test-task-123";
      const queueName = "test-queue";

      // Act
      const result = await Effect.runPromise(
        service.cancelMutationTask(taskId, queueName),
      );

      // Assert
      expect(result).toBeUndefined();
    });

    it("handles task cancellation errors", async () => {
      // Arrange
      using setup = setupMutationTaskService();
      const { service, mockTasksClient } = setup;
      const taskId = "invalid-task";
      const queueName = "test-queue";
      mockTasksClient.deleteTask.mockRejectedValue(new Error("Task not found"));

      // Act
      const errorResult = await Effect.runPromise(
        Effect.flip(service.cancelMutationTask(taskId, queueName)),
      );

      // Assert
      expect(errorResult).toBeDefined();
      expect(errorResult._tag).toBe("MutationTaskError");
    });
  });

  describe("getMutationTask", () => {
    it("returns not found error", async () => {
      // Arrange
      using setup = setupMutationTaskService();
      const { service } = setup;
      const taskId = "non-existent-task";

      // Act
      const result = await Effect.runPromise(
        Effect.flip(service.getMutationTask(taskId)),
      );

      // Assert
      expect(result).toBeDefined();
      expect(result._tag).toBe("HttpError");
      expect(result.message).toBe("Task not found");
      expect(result.statusCode).toBe(404);
    });
  });
});
