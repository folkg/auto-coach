import { Inject, Injectable } from "@angular/core";
// biome-ignore lint/style/useImportType: This is an injection token
import { Router } from "@angular/router";
import { assertDefined, ensure } from "@common/utilities/checks";
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
      const provider = new OAuthProvider("yahoo.com");
      await signInWithPopup(this.auth, provider);
      await this.router.navigate(["/teams"]);
    } catch (err) {
      throw new Error(`Couldn't sign in with Yahoo: ${getErrorMessage(err)}`);
    } finally {
      this.loading$.next(false);
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
      throw new Error(
        `Couldn't send verification email: ${getErrorMessage(err)}`,
      );
    }
  }

  async updateUserEmail(email: string): Promise<void> {
    try {
      assertDefined(this.auth.currentUser);
      await verifyBeforeUpdateEmail(this.auth.currentUser, email);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "Firebase: Error (auth/requires-recent-login).") {
          try {
            await this.reauthenticateYahoo();
            await this.updateUserEmail(email);
            return;
          } catch (err) {
            throw new Error(`Couldn't reauthenticate: ${getErrorMessage(err)}`);
          }
        }
      }
      throw new Error(`Couldn't update email: ${getErrorMessage(err)}`);
    }
  }
}
