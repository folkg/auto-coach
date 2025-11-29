import { type Auth, getAuth } from "firebase/auth";
import { type Firestore, getFirestore } from "firebase/firestore";
import { type Functions, getFunctions } from "firebase/functions";
import { InjectionToken } from "@angular/core";

export const AUTH = new InjectionToken<Auth>("Firebase Auth", {
  providedIn: "root",
  factory: () => getAuth(),
});

export const FIRESTORE = new InjectionToken<Firestore>("Firebase Firestore", {
  providedIn: "root",
  factory: () => getFirestore(),
});

export const FUNCTIONS = new InjectionToken<Functions>("Firebase Functions", {
  providedIn: "root",
  factory: () => getFunctions(),
});
