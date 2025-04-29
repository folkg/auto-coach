import { render, screen } from "@testing-library/angular";
import userEvent from "@testing-library/user-event";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { APIService } from "../services/api.service";
import { AppStatusService } from "../services/app-status.service";
import { AuthService } from "../services/auth.service";
import { FeedbackComponent } from "./feedback.component";

describe("FeedbackComponent", () => {
  const mockUser = {
    displayName: "Test User",
    uid: "test-uid",
    email: "test@example.com",
  };

  const mockAuthService = {
    getUser: vi.fn().mockResolvedValue(mockUser),
  };

  const online$ = new BehaviorSubject(true);
  const mockAppStatusService = {
    online$,
  };

  const mockAPIService = {
    sendFeedbackEmail: vi.fn().mockResolvedValue(true),
  };

  const defaultProviders = [
    { provide: AuthService, useValue: mockAuthService },
    { provide: AppStatusService, useValue: mockAppStatusService },
    { provide: APIService, useValue: mockAPIService },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    online$.next(true);
  });

  it("creates the component", async () => {
    await render(FeedbackComponent, { providers: defaultProviders });
    expect(screen.getByText("Contact Us")).toBeInTheDocument();
  });

  it("displays all feedback types", async () => {
    await render(FeedbackComponent, { providers: defaultProviders });

    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Bug Report")).toBeInTheDocument();
    expect(screen.getByText("Feature Request")).toBeInTheDocument();
  });

  it("disables submit button when form is invalid", async () => {
    await render(FeedbackComponent, { providers: defaultProviders });

    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("disables submit button when offline", async () => {
    const user = userEvent.setup();
    mockAppStatusService.online$.next(false);

    const { fixture } = await render(FeedbackComponent, {
      providers: defaultProviders,
    });

    const titleInput = screen.getByLabelText("Title");
    const feedbackInput = screen.getByLabelText("Feedback");
    const featureRequestOption = screen.getByText("Feature Request");

    await user.type(titleInput, "Test Title");
    await user.type(feedbackInput, "Test Feedback");
    await user.click(featureRequestOption);

    const form = fixture.componentInstance.feedbackForm?.form;

    expect(form?.valid).toBe(true);
    expect(form?.value).toMatchObject({
      title: "Test Title",
      feedback: "Test Feedback",
      feedbackType: "Feature Request",
    });

    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).toBeDisabled();
  });

  it("enables submit button when form is valid and online", async () => {
    const user = userEvent.setup();
    const { fixture } = await render(FeedbackComponent, {
      providers: defaultProviders,
    });

    const titleInput = screen.getByLabelText("Title");
    const feedbackInput = screen.getByLabelText("Feedback");
    const bugReportOption = screen.getByText("Bug Report");

    await user.type(titleInput, "Test Title");
    // TODO: Test invalid form state between
    await user.type(feedbackInput, "Test Feedback");
    await user.click(bugReportOption);

    const form = fixture.componentInstance.feedbackForm?.form;

    expect(form?.valid).toBe(true);
    expect(form?.value).toMatchObject({
      title: "Test Title",
      feedback: "Test Feedback",
      feedbackType: "Bug Report",
    });

    const submitButton = screen.getByTestId("submit-button");
    expect(submitButton).not.toBeDisabled();
  });

  it("shows success message after successful submission", async () => {
    const user = userEvent.setup();
    await render(FeedbackComponent, {
      providers: defaultProviders,
    });

    const titleInput = screen.getByLabelText("Title");
    const feedbackInput = screen.getByLabelText("Feedback");

    await user.type(titleInput, "Test Title");
    await user.type(feedbackInput, "Test Feedback");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(
      screen.getByText("Thank you for your feedback!"),
    ).toBeInTheDocument();
  });

  it("shows error message after failed submission", async () => {
    mockAPIService.sendFeedbackEmail.mockRejectedValueOnce(
      new Error("Failed to send feedback"),
    );

    const user = userEvent.setup();
    await render(FeedbackComponent, {
      providers: defaultProviders,
    });

    const titleInput = screen.getByLabelText("Title");
    const feedbackInput = screen.getByLabelText("Feedback");

    await user.type(titleInput, "Test Title");
    await user.type(feedbackInput, "Test Feedback");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(
      screen.getByText(
        "There was an error with your submission. Please try again later.",
      ),
    ).toBeInTheDocument();
  });

  it("rejects submission if honeypot is filled", async () => {
    const user = userEvent.setup();
    await render(FeedbackComponent, {
      providers: defaultProviders,
    });

    const titleInput = screen.getByLabelText("Title");
    const feedbackInput = screen.getByLabelText("Feedback");
    const honeypotInput = screen.getByLabelText("Email");

    await user.type(titleInput, "Test Title");
    await user.type(feedbackInput, "Test Feedback");
    await user.type(honeypotInput, "I am a bot");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(
      screen.getByText(
        "There was an error with your submission. Please try again later.",
      ),
    ).toBeInTheDocument();
  });

  it("shows loading state while submitting", async () => {
    mockAPIService.sendFeedbackEmail.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(true), 10);
        }),
    );

    const user = userEvent.setup();
    await render(FeedbackComponent, {
      providers: defaultProviders,
    });

    const titleInput = screen.getByLabelText("Title");
    const feedbackInput = screen.getByLabelText("Feedback");

    await user.type(titleInput, "Test Title");
    await user.type(feedbackInput, "Test Feedback");

    const submitButton = screen.getByText("Submit");
    await user.click(submitButton);

    expect(screen.getByText("Submitting Feedback...")).toBeInTheDocument();
  });
});
