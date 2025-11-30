import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MatDialog } from "@angular/material/dialog";
import { render, screen } from "@testing-library/angular";
import userEvent from "@testing-library/user-event";
import { AuthService } from "../services/auth.service";
import { LoginComponent } from "./login.component";

describe("LoginComponent", () => {
  const loading$ = new BehaviorSubject<boolean>(false);
  const mockAuthService = {
    loading$,
    loginYahoo: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };

  const mockDialog = {
    open: vi.fn(),
  };

  const defaultProviders = [
    { provide: AuthService, useValue: mockAuthService },
    { provide: MatDialog, useValue: mockDialog },
  ];

  beforeEach(() => {
    loading$.next(false);
    vi.clearAllMocks();
  });

  it("renders the component", async () => {
    await render(LoginComponent, {
      providers: defaultProviders,
    });

    expect(screen.getByText("Automatically Optimize your Lineups")).toBeTruthy();
    expect(screen.getByText("Sign in with Yahoo")).toBeTruthy();
    expect(screen.getByText("Learn More")).toBeTruthy();
  });

  describe("Button Actions", () => {
    it("calls login when clicking Sign in with Yahoo button", async () => {
      const user = userEvent.setup();

      await render(LoginComponent, {
        providers: defaultProviders,
      });

      const loginButton = screen.getByText("Sign in with Yahoo");
      await user.click(loginButton);

      expect(mockAuthService.loginYahoo).toHaveBeenCalledTimes(1);
    });

    it("shows error dialog when login fails", async () => {
      const user = userEvent.setup();
      const errorMessage = "Login failed";
      mockAuthService.loginYahoo.mockRejectedValueOnce(new Error(errorMessage));

      await render(LoginComponent, {
        providers: defaultProviders,
      });

      const loginButton = screen.getByText("Sign in with Yahoo");
      await user.click(loginButton);

      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            title: "ERROR",
            message: errorMessage,
            trueButton: "OK",
          }),
        }),
      );
    });
  });

  describe("Error Dialog", () => {
    it("opens error dialog with custom title", async () => {
      const component = await render(LoginComponent, {
        providers: defaultProviders,
      });

      component.fixture.componentInstance.errorDialog("Test message", "Custom Title");

      expect(mockDialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Custom Title",
            message: "Test message",
            trueButton: "OK",
          }),
        }),
      );
    });
  });
});
