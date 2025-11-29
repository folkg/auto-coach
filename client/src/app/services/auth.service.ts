import {
  type Auth,
  OAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  sendEmailVerification,
  signInWithPopup,
  signOut,
  type User,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { BehaviorSubject, firstValueFrom, Observable } from "rxjs";
import { Inject, Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { assertDefined, ensure } from "@common/utilities/checks";
import { delay } from "../../../../common/src/utilities/delay";
import { getErrorMessage } from "../../../../common/src/utilities/error";
import { AUTH } from "../shared/firebase-tokens";

@Injectable({
  providedIn: "root",
})
export class AuthService {
  readonly user$: Observable<User | null>;
  readonly loading$ = new BehaviorSubject<boolean>(false);

  constructor(
    private readonly router: Router,
    @Inject(AUTH) private readonly auth: Auth,
  ) {
    // if (!environment.production) {
    //   connectAuthEmulator(this.auth, 'http://localhost:9099', { disableWarnings: true })
    // }
    this.user$ = new Observable((subscriber) => {
      const unsubscribe = onAuthStateChanged(this.auth, subscriber);
      return { unsubscribe };
    });
  }

  async getUser(): Promise<User> {
    const val = await firstValueFrom(this.user$);
    return ensure(val);
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      await this.router.navigate(["/login"]);
      localStorage.clear();
      sessionStorage.clear();
    } catch (err) {
      throw new Error(`Couldn't sign out: ${getErrorMessage(err)}`);
    }
  }

  async loginYahoo(): Promise<void> {
    this.loading$.next(true);
    try {
      await this.attemptYahooLoginWithRetry();
      await this.router.navigate(["/teams"]);
    } catch (err) {
      if (err instanceof Error) {
        if (
          err.message.includes("auth/cancelled-popup-request") ||
          err.message.includes("auth/popup-closed-by-user")
        ) {
          // Wait a moment for auth state to settle and check if user actually authenticated
          // Sometimes this can be buggy
          await delay(1000);
          const user = this.auth.currentUser;
          if (user) {
            await this.router.navigate(["/teams"]);
            return;
          }
          throw new Error("Authentication was cancelled. Please try again.");
        }
      }
      throw new Error(`Couldn't sign in with Yahoo: ${getErrorMessage(err)}`);
    } finally {
      this.loading$.next(false);
    }
  }

  private async attemptYahooLoginWithRetry(maxRetries = 2): Promise<void> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const provider = new OAuthProvider("yahoo.com");
        await signInWithPopup(this.auth, provider);
        return;
      } catch (err) {
        if (err instanceof Error) {
          // Check if user actually authenticated despite the error
          // Sometimes this can be buggy
          const user = this.auth.currentUser;
          if (user) {
            return; // Success despite error
          }

          // Retryable errors
          if (
            err.message.includes("auth/popup-blocked") ||
            err.message.includes("auth/cancelled-popup-request") ||
            err.message.includes("auth/popup-closed-by-user")
          ) {
            if (attempt === maxRetries) {
              throw err;
            }
            await delay(2 ** attempt * 1000);
            continue;
          }
        }

        throw err;
      }
    }
  }

  async reauthenticateYahoo(): Promise<void> {
    const provider = new OAuthProvider("yahoo.com");
    if (!this.auth.currentUser) {
      throw new Error("User not found");
    }
    await reauthenticateWithPopup(this.auth.currentUser, provider);
  }

  async sendVerificationEmail(): Promise<void> {
    try {
      assertDefined(this.auth.currentUser);
      await sendEmailVerification(this.auth.currentUser);
      //TODO: Dialog to tell user to check email
    } catch (err) {
      throw new Error(`Couldn't send verification email: ${getErrorMessage(err)}`);
    }
  }

  async updateUserEmail(email: string): Promise<void> {
    try {
      assertDefined(this.auth.currentUser);
      await this.reauthenticateYahoo();
      await verifyBeforeUpdateEmail(this.auth.currentUser, email);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("auth/email-already-in-use")) {
          throw new Error("This email address is already in use by another account.");
        }
        if (err.message.includes("auth/invalid-email")) {
          throw new Error("The email address is not valid.");
        }
        if (
          err.message.includes("auth/cancelled-popup-request") ||
          err.message.includes("auth/popup-closed-by-user")
        ) {
          throw new Error("Authentication was cancelled. Please try again.");
        }
      }
      throw new Error(`Couldn't update email: ${getErrorMessage(err)}`);
    }
  }
}
