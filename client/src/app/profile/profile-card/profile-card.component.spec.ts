import type { User } from "firebase/auth";
import { BehaviorSubject } from "rxjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/angular";
import userEvent from "@testing-library/user-event";
import { createMock } from "../../../__mocks__/utils/createMock";
import { AppStatusService } from "../../services/app-status.service";
import { AuthService } from "../../services/auth.service";
import { ProfileCardComponent } from "./profile-card.component";

describe("ProfileCardComponent", () => {
  const mockUser = createMock<User>({
    displayName: "Test User",
    uid: "test-uid",
    email: "test@example.com",
    emailVerified: true,
    photoURL: "https://example.com/photo.jpg",
  });

  const user$ = new BehaviorSubject<User | null>(mockUser);
  const mockAuthService = {
    user$,
    updateUserEmail: vi.fn().mockResolvedValue(true),
    sendVerificationEmail: vi.fn().mockResolvedValue(true),
  };

  const online$ = new BehaviorSubject(true);
  const mockAppStatusService = {
    online$,
  };

  const defaultProviders = [
    { provide: AuthService, useValue: mockAuthService },
    { provide: AppStatusService, useValue: mockAppStatusService },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    user$.next(mockUser);
    online$.next(true);
  });

  it("creates the component", async () => {
    await render(ProfileCardComponent, { providers: defaultProviders });
    expect(screen.getByText("Test User")).toBeTruthy();
  });

  it("displays user email and photo", async () => {
    await render(ProfileCardComponent, { providers: defaultProviders });
    expect(screen.getByText("test@example.com")).toBeTruthy();
    const photo = screen.getByAltText("User Photo") as HTMLImageElement;
    expect(photo.getAttribute("src")).toBe("https://example.com/photo.jpg");
  });

  it("displays email verification warning if email is not verified", async () => {
    user$.next({ ...mockUser, emailVerified: false });

    await render(ProfileCardComponent, { providers: defaultProviders });
    expect(
      screen.getByText(
        /Your email address has not been verified, please check your inbox for the link./i,
      ),
    ).toBeTruthy();
  });

  it("enables edit mode when clicking edit button", async () => {
    const user = userEvent.setup();
    await render(ProfileCardComponent, { providers: defaultProviders });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("disables save button when form is invalid", async () => {
    const user = userEvent.setup();
    const { fixture } = await render(ProfileCardComponent, {
      providers: defaultProviders,
    });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "invalid-email");

    const form = fixture.componentInstance.emailFormControl;
    expect(form.valid).toBe(false);

    const saveButton = screen.getByTestId("save-button") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("enables save button when form is valid and online", async () => {
    const user = userEvent.setup();
    const { fixture } = await render(ProfileCardComponent, {
      providers: defaultProviders,
    });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");

    const form = fixture.componentInstance.emailFormControl;
    expect(form.valid).toBe(true);

    const saveButton = screen.getByTestId("save-button") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
  });

  it("disables save button when offline", async () => {
    const user = userEvent.setup();
    mockAppStatusService.online$.next(false);

    const { fixture } = await render(ProfileCardComponent, {
      providers: defaultProviders,
    });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");

    const form = fixture.componentInstance.emailFormControl;
    expect(form.valid).toBe(true);

    const saveButton = screen.getByTestId("save-button") as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it("emits isDirty event when form changes", async () => {
    const user = userEvent.setup();
    const isDirty = vi.fn();

    await render(ProfileCardComponent, {
      providers: defaultProviders,
      on: {
        isDirty,
      },
    });

    user$.next({ ...mockUser, emailVerified: true });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");

    expect(isDirty).toHaveBeenCalledTimes(2);
    expect(isDirty).toHaveBeenCalledWith(true);

    isDirty.mockClear();

    const cancelButton = screen.getByText("Cancel");
    await user.click(cancelButton);

    expect(isDirty).toHaveBeenCalledTimes(2);
    expect(isDirty).toHaveBeenCalledWith(false);
  });

  it("calls updateUserEmail when saving changes", async () => {
    const user = userEvent.setup();
    await render(ProfileCardComponent, { providers: defaultProviders });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");

    const saveButton = screen.getByText("Save Changes");
    await user.click(saveButton);

    expect(mockAuthService.updateUserEmail).toHaveBeenCalledWith("new@example.com");
  });

  it("calls sendVerificationEmail when clicking resend verification email button", async () => {
    user$.next({ ...mockUser, emailVerified: false });

    const user = userEvent.setup();
    await render(ProfileCardComponent, { providers: defaultProviders });

    const resendButton = screen.getByText("Re-send Verification Email");
    await user.click(resendButton);

    expect(mockAuthService.sendVerificationEmail).toHaveBeenCalled();
  });

  it("cancels changes when clicking cancel button", async () => {
    const user = userEvent.setup();
    await render(ProfileCardComponent, { providers: defaultProviders });

    const editButton = screen.getByText("Edit");
    await user.click(editButton);

    const emailInput = screen.getByLabelText("Email");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");

    const cancelButton = screen.getByText("Cancel");
    await user.click(cancelButton);

    expect(screen.getByText("test@example.com")).toBeTruthy();
  });
});
