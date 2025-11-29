import { BehaviorSubject } from "rxjs";
import spacetime from "spacetime";
import { beforeEach, describe, expect, it } from "vitest";
import { MatCardModule } from "@angular/material/card";
import { render, screen } from "@testing-library/angular";
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

    expect(screen.getByText("About Fantasy AutoCoach")).toBeInTheDocument();
  });

  it("displays all main section headers", async () => {
    await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent],
    });

    expect(screen.getByText("How it Works")).toBeInTheDocument();
    expect(screen.getByText("Why?")).toBeInTheDocument();
    expect(screen.getByText("How to Set Up")).toBeInTheDocument();
    expect(screen.getByText("What it Won't Do")).toBeInTheDocument();
  });

  it("displays all key features under How it Works", async () => {
    await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent],
    });

    expect(screen.getByText("Optimized Lineups")).toBeInTheDocument();
    expect(screen.getByText("Last Minute Lineup Changes")).toBeInTheDocument();
    expect(screen.getByText("Intelligent Use of Injury Spaces")).toBeInTheDocument();
    expect(screen.getByText("Easy to Use")).toBeInTheDocument();
  });

  it("renders the TeamComponent", async () => {
    const { container } = await render(AboutComponent, {
      providers: defaultProviders,
      imports: [TeamComponent, RobotsComponent, MatCardModule],
      declarations: [RelativeDatePipe],
    });

    expect(container.querySelector("app-team")).toBeInTheDocument();
    expect(screen.getByText("Bat Attitudes")).toBeInTheDocument();
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
