import { InjectionToken } from "@angular/core";
import { type Auth, getAuth } from "firebase/auth";

export const AUTH = new InjectionToken<Auth>("Firebase Auth", {
  providedIn: "root",
  factory: () => getAuth(),
});
