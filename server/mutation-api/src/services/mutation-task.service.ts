import { Data, Effect } from "effect";
import type { Firestore } from "@google-cloud/firestore";
import type { CloudTasksClient } from "@google-cloud/tasks";
import type { MutationTask } from "../types/schemas";
import { HttpError } from "../types/schemas";

export class MutationTaskError extends Data.TaggedError("MutationTaskError")<{
  readonly message: string;
}> {}

export interface CreateMutationTaskRequest {
  readonly type: MutationTask["type"];
  readonly payload: MutationTask["payload"];
  readonly userId: MutationTask["userId"];
  readonly queueName: string;
  readonly scheduledFor?: string;
}

export class MutationTaskService {
  private readonly tasksClient: CloudTasksClient;
  private readonly firestore: Firestore;

  constructor(firestore: Firestore, tasksClient: CloudTasksClient) {
    this.firestore = firestore;
    this.tasksClient = tasksClient;
  }

  createMutationTask(
    request: CreateMutationTaskRequest,
  ): Effect.Effect<MutationTask, MutationTaskError> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        const newTask: MutationTask = {
          id,
          type: request.type,
          payload: request.payload,
          userId: request.userId,
          createdAt,
          status: "PENDING",
        };

        // Persist task to Firestore
        await this.firestore.collection("mutationTasks").doc(id).set(newTask);

        // Create Cloud Task for processing
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const location = process.env.GOOGLE_CLOUD_LOCATION;

        if (!(projectId && location)) {
          throw new MutationTaskError({
            message:
              "Missing required environment variables: GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_LOCATION",
          });
        }

        const parent = this.tasksClient.queuePath(projectId, location, request.queueName);

        const cloudTask = {
          name: `${parent}/tasks/${id}`,
          httpRequest: {
            httpMethod: "POST" as const,
            url: `${process.env.MUTATION_API_URL}/execute/mutation`,
            headers: {
              "Content-Type": "application/json",
            },
            body: Buffer.from(JSON.stringify(newTask)).toString("base64"),
          },
          scheduleTime: request.scheduledFor
            ? {
                seconds: Math.floor(new Date(request.scheduledFor).getTime() / 1000),
              }
            : undefined,
        };

        await this.tasksClient.createTask({ parent, task: cloudTask });

        return newTask;
      },
      catch: (error) =>
        new MutationTaskError({
          message: `Failed to create mutation task: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }

  getMutationTask(_id: string): Effect.Effect<MutationTask, HttpError> {
    return Effect.fail(
      new HttpError({
        message: "Task not found",
        statusCode: 404,
      }),
    );
  }

  scheduleMutationTask(
    request: CreateMutationTaskRequest,
    scheduledFor: Date,
  ): Effect.Effect<MutationTask, MutationTaskError> {
    return this.createMutationTask({
      ...request,
      scheduledFor: scheduledFor.toISOString(),
    });
  }

  cancelMutationTask(taskId: string, queueName: string): Effect.Effect<void, MutationTaskError> {
    return Effect.tryPromise({
      try: async () => {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        const location = process.env.GOOGLE_CLOUD_LOCATION;

        if (!(projectId && location)) {
          throw new MutationTaskError({
            message:
              "Missing required environment variables: GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_LOCATION",
          });
        }

        const name = this.tasksClient.taskPath(projectId, location, queueName, taskId);

        await this.tasksClient.deleteTask({ name });
      },
      catch: (error) =>
        new MutationTaskError({
          message: `Failed to cancel mutation task: ${error instanceof Error ? error.message : String(error)}`,
        }),
    });
  }
}
