import { Component } from "@angular/core";

@Component({
  standalone: true,
  template: "Mock Login Page",
  selector: "app-mock-login",
})
class MockLoginComponent {}

@Component({
  standalone: true,
  template: "Mock Teams Page",
  selector: "app-mock-teams",
})
class MockTeamsComponent {}

@Component({
  standalone: true,
  template: "Mock Transactions Page",
  selector: "app-mock-transactions",
})
class MockTransactionsComponent {}

@Component({
  standalone: true,
  template: "Mock Profile Page",
  selector: "app-mock-profile",
})
class MockProfileComponent {}

@Component({
  standalone: true,
  template: "Mock About Page",
  selector: "app-mock-about",
})
class MockAboutComponent {}

@Component({
  standalone: true,
  template: "Mock Feedback Page",
  selector: "app-mock-feedback",
})
class MockFeedbackComponent {}

export const mockRoutes = [
  { path: "login", component: MockLoginComponent },
  { path: "teams", component: MockTeamsComponent },
  { path: "transactions", component: MockTransactionsComponent },
  { path: "profile", component: MockProfileComponent },
  { path: "about", component: MockAboutComponent },
  { path: "feedback", component: MockFeedbackComponent },
  { path: "", component: MockLoginComponent },
];
