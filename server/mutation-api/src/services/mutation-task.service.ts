import { Context, Effect, Layer, Schema } from "effect";
import type { Firestore } from "@google-cloud/firestore";
import type { CloudTasksClient } from "@google-cloud/tasks";
import type { MutationTask } from "../types/schemas";
import { HttpError } from "../types/schemas";

export class MutationTaskError extends Schema.TaggedError<MutationTaskError>()(
  "MutationTaskError",
  {
    message: Schema.String,
    error: Schema.optional(Schema.Defect),
  },
) {}

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
          throw new Error(
            "Missing required environment variables: GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_LOCATION",
          );
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
        MutationTaskError.make({
          message: "Failed to create mutation task",
          error,
        }),
    });
  }

  getMutationTask(_id: string): Effect.Effect<MutationTask, HttpError> {
    return HttpError.make({
      message: "Task not found",
      statusCode: 404,
    });
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
          throw new Error(
            "Missing required environment variables: GOOGLE_CLOUD_PROJECT_ID or GOOGLE_CLOUD_LOCATION",
          );
        }

        const name = this.tasksClient.taskPath(projectId, location, queueName, taskId);

        await this.tasksClient.deleteTask({ name });
      },
      catch: (error) =>
        MutationTaskError.make({
          message: "Failed to cancel mutation task",
          error,
        }),
    });
  }
}

/**
 * Service interface for mutation task operations.
 */
export interface MutationTasksService {
  readonly createMutationTask: (
    request: CreateMutationTaskRequest,
  ) => Effect.Effect<MutationTask, MutationTaskError>;
  readonly getMutationTask: (id: string) => Effect.Effect<MutationTask, HttpError>;
  readonly scheduleMutationTask: (
    request: CreateMutationTaskRequest,
    scheduledFor: Date,
  ) => Effect.Effect<MutationTask, MutationTaskError>;
  readonly cancelMutationTask: (
    taskId: string,
    queueName: string,
  ) => Effect.Effect<void, MutationTaskError>;
}

/**
 * Context.Tag for the MutationTasks service.
 * Use `MutationTasks.layer` for production or create test layers.
 */
export class MutationTasks extends Context.Tag("@mutation-api/MutationTasks")<
  MutationTasks,
  MutationTasksService
>() {
  static layer(firestore: Firestore, tasksClient: CloudTasksClient): Layer.Layer<MutationTasks> {
    const service = new MutationTaskService(firestore, tasksClient);
    return Layer.succeed(MutationTasks, {
      createMutationTask: service.createMutationTask.bind(service),
      getMutationTask: service.getMutationTask.bind(service),
      scheduleMutationTask: service.scheduleMutationTask.bind(service),
      cancelMutationTask: service.cancelMutationTask.bind(service),
    });
  }
}
