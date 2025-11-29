import type { Routes } from "@angular/router";
import { AboutComponent } from "./app/about/about.component";
import { authGuard } from "./app/guards/auth.guard";
import { DirtyFormGuard } from "./app/guards/dirty-form.guard";
import { loginGuard } from "./app/guards/login.guard";
import { LoginComponent } from "./app/login/login.component";
import { NotfoundComponent } from "./app/notfound/notfound.component";
import { TeamsComponent } from "./app/teams/teams.component";

export const routes: Routes = [
  { path: "", redirectTo: "/teams", pathMatch: "full" },
  {
    path: "about",
    component: AboutComponent,
  },
  {
    path: "login",
    component: LoginComponent,
    canActivate: [loginGuard],
  },
  {
    path: "teams",
    component: TeamsComponent,
    canActivate: [authGuard],
    canDeactivate: [DirtyFormGuard],
  },
  {
    path: "feedback",
    loadComponent: () =>
      import("./app/feedback/feedback.component").then((m) => m.FeedbackComponent),
    canActivate: [authGuard],
    canDeactivate: [DirtyFormGuard],
  },
  {
    path: "profile",
    loadComponent: () => import("./app/profile/profile.component").then((m) => m.ProfileComponent),
    canActivate: [authGuard],
    canDeactivate: [DirtyFormGuard],
  },
  {
    path: "transactions",
    loadComponent: () =>
      import("./app/transactions/transactions.component").then((m) => m.TransactionsComponent),
    canActivate: [authGuard],
  },
  { path: "**", component: NotfoundComponent },
];
