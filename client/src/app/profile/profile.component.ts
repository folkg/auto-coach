import { Component, inject } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { logError } from "@common/utilities/error";

import { AuthService } from "../services/auth.service";
import { OfflineWarningCardComponent } from "../shared/offline-warning-card/offline-warning-card.component";
import { ProfileCardComponent } from "./profile-card/profile-card.component";

@Component({
  selector: "app-profile",
  templateUrl: "./profile.component.html",
  styleUrls: ["./profile.component.scss"],
  imports: [OfflineWarningCardComponent, ProfileCardComponent, MatButton],
})
export class ProfileComponent {
  private readonly auth = inject(AuthService);

  private isDirty = false;

  public logout(): void {
    this.auth.logout().catch(logError);
  }

  public onDirtyChange(dirty: boolean): void {
    this.isDirty = dirty;
  }

  public canDeactivate(): boolean {
    return !this.isDirty;
  }
}
