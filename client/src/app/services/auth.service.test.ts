import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";
import { createMock } from "@common/utilities/createMock";
import { type Auth, signInWithPopup, type User, type UserCredential } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH } from "../shared/firebase-tokens";
import { AuthService } from "./auth.service";

// Mock the delay function from common utilities
vi.mock("../../../../common/src/utilities/delay", () => ({
  delay: vi.fn().mockResolvedValue(undefined),
}));

describe("AuthService", () => {
  let service: AuthService;
  let mockAuth: Auth;
  let mockRouter: Router;
  let mockUser: User;

  beforeEach(() => {
    vi.clearAllMocks();

    mockUser = createMock<User>({
      uid: "test-uid",
      email: "test@yahoo.com",
    });

    mockAuth = createMock<Auth>({
      currentUser: null,
    });

    mockRouter = createMock<Router>({
      navigate: vi.fn(),
    });

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: mockRouter },
        { provide: AUTH, useValue: mockAuth },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  describe("loginYahoo", () => {
    it("navigates to teams on successful authentication", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      const mockCredential = createMock<UserCredential>();
      mockSignInWithPopup.mockResolvedValue(mockCredential);

      // Act
      await service.loginYahoo();

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/teams"]);
      expect(service.loading$.value).toBe(false);
    });

    it("handles popup-closed-by-user error when user is not authenticated", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      const popupError = new Error("Firebase: Error (auth/popup-closed-by-user)");
      mockSignInWithPopup.mockRejectedValue(popupError);

      // Act & Assert
      let errorThrown: Error | undefined;
      try {
        await service.loginYahoo();
      } catch (err) {
        errorThrown = err as Error;
      }

      expect(errorThrown?.message).toBe("Authentication was cancelled. Please try again.");
      expect(mockRouter.navigate).not.toHaveBeenCalled();
      expect(service.loading$.value).toBe(false);
    });

    it("navigates to teams when popup-closed-by-user error occurs but user is authenticated", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      const popupError = new Error("Firebase: Error (auth/popup-closed-by-user)");
      mockSignInWithPopup.mockRejectedValue(popupError);

      // Mock the auth to have a current user
      Object.defineProperty(mockAuth, "currentUser", {
        value: mockUser,
        writable: true,
      });

      // Act
      await service.loginYahoo();

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/teams"]);
      expect(service.loading$.value).toBe(false);
    });

    it("retries on popup-closed-by-user error up to max retries", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      const popupError = new Error("Firebase: Error (auth/popup-closed-by-user)");
      mockSignInWithPopup.mockRejectedValue(popupError);

      // Mock the auth to have no current user
      Object.defineProperty(mockAuth, "currentUser", {
        value: null,
        writable: true,
      });

      // Act & Assert
      let errorThrown: Error | undefined;
      try {
        await service.loginYahoo();
      } catch (err) {
        errorThrown = err as Error;
      }

      expect(errorThrown?.message).toBe("Authentication was cancelled. Please try again.");
      expect(mockSignInWithPopup).toHaveBeenCalledTimes(3); // Initial attempt + 2 retries
      expect(service.loading$.value).toBe(false);
    });

    it("does not retry on non-retryable errors", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      // Use an error that is NOT in the retryable list (popup-blocked, cancelled-popup-request, popup-closed-by-user)
      const nonRetryableError = new Error("Firebase: Error (auth/network-request-failed)");
      mockSignInWithPopup.mockRejectedValue(nonRetryableError);

      // Act & Assert
      let errorThrown: Error | undefined;
      try {
        await service.loginYahoo();
      } catch (err) {
        errorThrown = err as Error;
      }

      expect(errorThrown?.message).toBe(
        "Couldn't sign in with Yahoo: Firebase: Error (auth/network-request-failed)",
      );
      expect(mockSignInWithPopup).toHaveBeenCalledTimes(1);
      expect(service.loading$.value).toBe(false);
    });

    it("succeeds on retry after initial popup failure", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      const popupError = new Error("Firebase: Error (auth/popup-closed-by-user)");
      const mockCredential = createMock<UserCredential>();
      mockSignInWithPopup.mockRejectedValueOnce(popupError).mockResolvedValueOnce(mockCredential);

      // Act
      await service.loginYahoo();

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(["/teams"]);
      expect(mockSignInWithPopup).toHaveBeenCalledTimes(2);
      expect(service.loading$.value).toBe(false);
    });
  });

  describe("loading state", () => {
    it("sets loading to true during login and false after completion", async () => {
      // Arrange
      const mockSignInWithPopup = vi.mocked(signInWithPopup);
      let resolveLogin: ((value: UserCredential) => void) | undefined;
      const loginPromise = new Promise<UserCredential>((resolve) => {
        resolveLogin = resolve;
      });
      mockSignInWithPopup.mockReturnValue(loginPromise);

      // Act
      const loginResult = service.loginYahoo();

      // Assert - loading should be true during login
      expect(service.loading$.value).toBe(true);

      // Resolve the login
      const mockCredential = createMock<UserCredential>();
      resolveLogin?.(mockCredential);
      await loginResult;

      // Assert - loading should be false after completion
      expect(service.loading$.value).toBe(false);
    });
  });
});
