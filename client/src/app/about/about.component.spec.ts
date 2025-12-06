import { MatCardModule } from "@angular/material/card";
import { render, screen } from "@testing-library/angular";
import { BehaviorSubject } from "rxjs";
import spacetime from "spacetime";
import { beforeEach, describe, expect, it } from "vitest";

import { AppStatusService } from "../services/app-status.service";
import { RobotsComponent } from "../shared/robots/robots.component";
import { RelativeDatePipe } from "../teams/pipes/relative-date.pipe";
import { TeamComponent } from "../teams/team/team.component";
import { AboutComponent } from "./about.component";

describe("AboutComponent", () => {
  const mockSpacetimeNow = spacetime("Jan 30, 2025", "Canada/Pacific");

  const focus$ = new BehaviorSubject(mockSpacetimeNow);

  const mockAppStatusService = {
    focus$,
  };

  const defaultProviders = [{ provide: AppStatusService, useValue: mockAppStatusService }];

  beforeEach(() => {
    focus$.next(mockSpacetimeNow);
  });

  it("renders the component", async () => {
    await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent],
    });

    expect(screen.getByText("About Fantasy AutoCoach")).toBeTruthy();
  });

  it("displays all main section headers", async () => {
    await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent],
    });

    expect(screen.getByText("How it Works")).toBeTruthy();
    expect(screen.getByText("Why?")).toBeTruthy();
    expect(screen.getByText("How to Set Up")).toBeTruthy();
    expect(screen.getByText("What it Won't Do")).toBeTruthy();
  });

  it("displays all key features under How it Works", async () => {
    await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent],
    });

    expect(screen.getByText("Optimized Lineups")).toBeTruthy();
    expect(screen.getByText("Last Minute Lineup Changes")).toBeTruthy();
    expect(screen.getByText("Intelligent Use of Injury Spaces")).toBeTruthy();
    expect(screen.getByText("Easy to Use")).toBeTruthy();
  });

  it("renders the TeamComponent", async () => {
    const { container } = await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent, MatCardModule],
      declarations: [RelativeDatePipe],
    });

    expect(container.querySelector("app-team")).toBeTruthy();
    expect(screen.getByText("Bat Attitudes")).toBeTruthy();
  });

  it("updates sample timestamps based on focus changes", async () => {
    const { fixture } = await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent],
    });

    const initialTimestamp = fixture.componentInstance.sampleTimestamps();

    // Simulate time change
    const newTime = mockSpacetimeNow.add(1, "day");
    focus$.next(newTime);

    const updatedTimestamp = fixture.componentInstance.sampleTimestamps();
    expect(updatedTimestamp).not.toEqual(initialTimestamp);
  });
});
