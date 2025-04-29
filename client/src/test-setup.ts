import "@analogjs/vitest-angular/setup-snapshots";
import "@angular/compiler";
import "@testing-library/jest-dom/vitest";

import {
  NgModule,
  provideExperimentalZonelessChangeDetection,
} from "@angular/core";
import { getTestBed } from "@angular/core/testing";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import {
  mockAuth,
  mockFirestore,
  mockFunctions,
} from "./__mocks__/firebase/firebase";
import { AUTH, FIRESTORE, FUNCTIONS } from "./app/shared/firebase-tokens";

@NgModule({
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideNoopAnimations(),
    { provide: AUTH, useValue: mockAuth },
    { provide: FIRESTORE, useValue: mockFirestore },
    { provide: FUNCTIONS, useValue: mockFunctions },
  ],
})
class ZonelessModule {}

getTestBed().initTestEnvironment(
  [BrowserDynamicTestingModule, ZonelessModule],
  platformBrowserDynamicTesting(),
);
