import { NgModule, provideZonelessChangeDetection } from "@angular/core";
import { getTestBed, TestBed } from "@angular/core/testing";
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from "@angular/platform-browser-dynamic/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { beforeEach } from "vitest";

import { mockAuth } from "./__mocks__/firebase/firebase";
import { AUTH } from "./app/shared/firebase-tokens";

@NgModule({
  providers: [
    provideZonelessChangeDetection(),
    provideNoopAnimations(),
    { provide: AUTH, useValue: mockAuth },
  ],
})
class ZonelessModule {}

const testBed = getTestBed();

if (!testBed.platform) {
  testBed.initTestEnvironment(
    [BrowserDynamicTestingModule, ZonelessModule],
    platformBrowserDynamicTesting(),
  );
}

beforeEach(() => {
  TestBed.resetTestingModule();
});
