export class RevokedRefreshTokenError extends Error {
  constructor(message: string) {
    super(`RevokedRefreshTokenError: ${message}`);
    this.name = "RevokedRefreshTokenError";
  }
}
