import { Effect } from "effect";

import type { MutationTask } from "../types/schemas";

import { HttpError } from "../types/schemas";

export class MutationService {
  createMutationTask(
    task: Omit<MutationTask, "id" | "createdAt">,
  ): Effect.Effect<MutationTask, HttpError> {
    return Effect.gen(function* () {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const newTask: MutationTask = {
        ...task,
        id,
        createdAt,
      };

      yield* Effect.logInfo("Creating mutation task").pipe(
        Effect.annotateLogs("event", "MUTATION_TASK_CREATED"),
        Effect.annotateLogs("taskId", id),
        Effect.annotateLogs("taskType", task.type),
        Effect.annotateLogs("userId", task.userId),
      );

      return newTask;
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
}
