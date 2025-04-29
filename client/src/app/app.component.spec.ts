import { OverlayContainer } from "@angular/cdk/overlay";
import type { User } from "@firebase/auth";
import { render } from "@testing-library/angular";
import { BehaviorSubject } from "rxjs";
import { describe } from "vitest";
import { AppComponent } from "./app.component";
import { AuthService } from "./services/auth.service";
import type { Team } from "./services/interfaces/team";
import { SyncTeamsService } from "./services/sync-teams.service";
import { ThemingService } from "./services/theming.service";

describe("AppComponent", () => {
  const user$ = new BehaviorSubject<User | null>(null);
  const teams$ = new BehaviorSubject<Team[]>([]);
  const theme$ = new BehaviorSubject<string>("light-theme");

  const mockAuthService = {
    user$,
  };

  const mockSyncTeamsService = {
    teams$,
  };

  const mockThemingService = {
    theme$,
  };

  const defaultProviders = [
    { provide: AuthService, useValue: mockAuthService },
    { provide: SyncTeamsService, useValue: mockSyncTeamsService },
    { provide: ThemingService, useValue: mockThemingService },
    {
      provide: OverlayContainer,
      useValue: { getContainerElement: () => document.createElement("div") },
    },
  ];

  beforeEach(() => {
    user$.next(null);
    teams$.next([]);
    theme$.next("light-theme");
  });

  it("renders the component", async () => {
    await render(AppComponent, {
      providers: defaultProviders,
    });
  });
});
