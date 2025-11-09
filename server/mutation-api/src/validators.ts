import { effectValidator } from "@hono/effect-validator";
import {
  CalcPositionalScarcityRequestSchema,
  ExecuteMutationRequestSchema,
  SetLineupRequestSchema,
  WeeklyTransactionsRequestSchema,
} from "./types/api-schemas";

export const validateSetLineup = effectValidator(
  "json",
  SetLineupRequestSchema,
);

export const validateWeeklyTransactions = effectValidator(
  "json",
  WeeklyTransactionsRequestSchema,
);

export const validateCalcPositionalScarcity = effectValidator(
  "json",
  CalcPositionalScarcityRequestSchema,
);

export const validateExecuteMutation = effectValidator(
  "json",
  ExecuteMutationRequestSchema,
);
