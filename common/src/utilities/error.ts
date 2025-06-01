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
