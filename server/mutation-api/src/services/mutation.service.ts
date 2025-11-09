import { Effect } from "effect";
import type { MutationTask } from "../types/schemas";
import { HttpError } from "../types/schemas";

export class MutationService {
  createMutationTask(
    task: Omit<MutationTask, "id" | "createdAt">,
  ): Effect.Effect<MutationTask, HttpError> {
    return Effect.sync(() => {
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();

      const newTask: MutationTask = {
        ...task,
        id,
        createdAt,
      };

      // TODO: Implement actual task creation logic
      console.log("Creating mutation task:", newTask);

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
