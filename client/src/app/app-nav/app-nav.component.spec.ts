import type { ClientTeam } from "@common/types/team";
import type { User } from "firebase/auth";

import { BreakpointObserver } from "@angular/cdk/layout";
import { createMock } from "@common/utilities/createMock";
import { render, screen } from "@testing-library/angular";
import userEvent from "@testing-library/user-event";
import { BehaviorSubject, Observable } from "rxjs";
import { beforeEach, describe, expect, it } from "vitest";

import { mockRoutes } from "../../__mocks__/routes/routes";
import { AuthService } from "../services/auth.service";
import { SyncTeamsService } from "../services/sync-teams.service";
import { ThemingService } from "../services/theming.service";
import { AppNavComponent } from "./app-nav.component";

describe("AppNavComponent", () => {
  const user$ = new BehaviorSubject<User | null>(null);
  const teams$ = new BehaviorSubject<ClientTeam[]>([]);
  const isHandset$ = new BehaviorSubject(false);

  const mockAuthService = {
    user$,
  };

  const mockSyncTeamsService = {
    teams$,
  };

  const mockThemingService = {
    darkModeOn: false,
  };

  const mockBreakpointObserver = {
    observe: () =>
      new Observable((subscriber) => {
        subscriber.next({ matches: isHandset$.value });
      }),
  };

  const defaultProviders = [
    { provide: AuthService, useValue: mockAuthService },
    { provide: SyncTeamsService, useValue: mockSyncTeamsService },
    { provide: ThemingService, useValue: mockThemingService },
    { provide: BreakpointObserver, useValue: mockBreakpointObserver },
  ];

  beforeEach(() => {
    user$.next(null);
    teams$.next([]);
    isHandset$.next(false);
  });

  it("renders the component", async () => {
    await render(AppNavComponent, {
      providers: defaultProviders,
    });

    expect(screen.getByText("Fantasy AutoCoach")).toBeDefined();
    expect(screen.getByText("Menu")).toBeDefined();
  });

  describe("Navigation Links", () => {
    it("shows login link when user is not logged in", async () => {
      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      expect(screen.getByText("Login")).toBeDefined();

      expect(screen.getByText("How It Works")).toBeDefined();

      expect(screen.queryByText("My Teams")).toBeNull();
      expect(screen.queryByText("Profile")).toBeNull();
      expect(screen.queryByText("Contact")).toBeNull();
    });

    it("shows authenticated links when user is logged in", async () => {
      user$.next(createMock<User>({ uid: "123" }));

      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      expect(screen.getByText("How It Works")).toBeDefined();

      expect(screen.getByText("My Teams")).toBeDefined();
      expect(screen.getByText("Profile")).toBeDefined();
      expect(screen.getByText("Contact")).toBeDefined();

      expect(screen.queryByText("Login")).toBeNull();
    });

    it("shows transactions link when user has transactions enabled", async () => {
      user$.next(createMock<User>({ uid: "123" }));
      teams$.next([createMock<ClientTeam>({ allow_transactions: true })]);

      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      expect(screen.getByText("Transactions")).toBeDefined();
    });

    it("hides transactions link when user does not have transactions enabled", async () => {
      user$.next(createMock<User>({ uid: "123" }));
      teams$.next([createMock<ClientTeam>({ allow_transactions: false })]);

      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      expect(screen.queryByText("Transactions")).toBeNull();
    });
  });

  describe("Navigation Tests", () => {
    it("navigates to login page when clicking login link", async () => {
      await render(AppNavComponent, {
        providers: defaultProviders,
        routes: [
          {
            path: "",
            children: mockRoutes,
          },
        ],
        initialRoute: "/about",
      });

      const user = userEvent.setup();
      const loginLink = screen.getByText("Login");

      expect(screen.queryByText("Mock Login Page")).toBeNull();
      await user.click(loginLink);
      expect(screen.getByText("Mock Login Page")).toBeDefined();
    });

    it("navigates to authenticated routes when logged in", async () => {
      user$.next(createMock<User>({ uid: "123" }));
      teams$.next([createMock<ClientTeam>({ allow_transactions: true })]);

      await render(AppNavComponent, {
        providers: defaultProviders,
        routes: [
          {
            path: "",
            children: mockRoutes,
          },
        ],
      });

      const user = userEvent.setup();

      const teamsLink = screen.getByText("My Teams");
      expect(screen.queryByText("Mock Teams Page")).toBeNull();
      await user.click(teamsLink);
      expect(screen.getByText("Mock Teams Page")).toBeDefined();

      const transactionsLink = screen.getByText("Transactions");
      expect(screen.queryByText("Mock Transactions Page")).toBeNull();
      await user.click(transactionsLink);
      expect(screen.getByText("Mock Transactions Page")).toBeDefined();

      const profileLink = screen.getByText("Profile");
      expect(screen.queryByText("Mock Profile Page")).toBeNull();
      await user.click(profileLink);
      expect(screen.getByText("Mock Profile Page")).toBeDefined();

      const contactLink = screen.getByText("Contact");
      expect(screen.queryByText("Mock Feedback Page")).toBeNull();
      await user.click(contactLink);
      expect(screen.getByText("Mock Feedback Page")).toBeDefined();

      const aboutLink = screen.getByText("How It Works");
      expect(screen.queryByText("Mock About Page")).toBeNull();
      await user.click(aboutLink);
      expect(screen.getByText("Mock About Page")).toBeDefined();
    });

    it("navigates to How It Works page when clicking the link", async () => {
      await render(AppNavComponent, {
        providers: defaultProviders,
        routes: [
          {
            path: "",
            children: mockRoutes,
          },
        ],
      });
      const user = userEvent.setup();

      const aboutLink = screen.getByText("How It Works");
      expect(screen.queryByText("Mock About Page")).toBeNull();
      await user.click(aboutLink);
      expect(screen.getByText("Mock About Page")).toBeDefined();
    });

    it("navigates to home when clicking the logo", async () => {
      await render(AppNavComponent, {
        providers: defaultProviders,
        routes: [
          {
            path: "",
            children: mockRoutes,
          },
        ],
        initialRoute: "/about",
      });

      const user = userEvent.setup();
      const logo = screen.getByAltText("logo");

      expect(screen.queryByText("Mock Login Page")).toBeNull();
      await user.click(logo);
      expect(screen.getByText("Mock Login Page")).toBeDefined();
    });
  });

  describe("Theme Toggle", () => {
    it("toggles dark mode when clicking theme button", async () => {
      const user = userEvent.setup();

      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      const themeButton = screen.getByTestId("toggle-theme-button");

      await user.click(themeButton);
      expect(mockThemingService.darkModeOn).toBe(true);

      await user.click(themeButton);
      expect(mockThemingService.darkModeOn).toBe(false);
    });
  });

  describe("Responsive Behavior", () => {
    it("shows menu button on mobile view", async () => {
      isHandset$.next(true);

      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      expect(screen.queryByTestId("toggle-sidenav-button")).toBeDefined();
    });

    it("hides menu button on desktop view", async () => {
      isHandset$.next(false);

      await render(AppNavComponent, {
        providers: defaultProviders,
      });

      expect(screen.queryByTestId("toggle-sidenav-button")).toBeNull();
    });
  });
});
