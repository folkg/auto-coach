import { InjectionToken } from "@angular/core";
import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";

export const AUTH = new InjectionToken<Auth>("Firebase Auth", {
  providedIn: "root",
  factory: () => getAuth(),
});

export const FIRESTORE = new InjectionToken<Firestore>("Firebase Firestore", {
  providedIn: "root",
  factory: () => getFirestore(),
});
