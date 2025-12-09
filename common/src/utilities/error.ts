export function logError(err: unknown, message = "Error:"): void {
  if (err instanceof Error) {
    console.error(message, err.message);
  } else {
    console.error(message, err);
  }
}

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class ApiRateLimitError extends Error {
  readonly statusCode: number;
  readonly retryAfter: number | undefined;

  constructor(message: string, statusCode: number, retryAfter?: number) {
    super(message);
    this.name = "ApiRateLimitError";
    this.statusCode = statusCode;
    this.retryAfter = retryAfter;
  }
}

export function isApiRateLimitError(error: unknown): error is ApiRateLimitError {
  return error instanceof ApiRateLimitError;
}

export class AuthorizationError extends Error {
  readonly statusCode: number;
  readonly userId: string | undefined;

  constructor(message: string, statusCode: number, userId?: string) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
    this.userId = userId;
  }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
  return error instanceof AuthorizationError;
}
