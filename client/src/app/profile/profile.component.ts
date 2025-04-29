import { Component } from "@angular/core";
import { MatButton } from "@angular/material/button";

// biome-ignore lint/style/useImportType: This is an injection token
import { AuthService } from "../services/auth.service";
import { OfflineWarningCardComponent } from "../shared/offline-warning-card/offline-warning-card.component";
import { logError } from "../shared/utils/error";
import { ProfileCardComponent } from "./profile-card/profile-card.component";

@Component({
  selector: "app-profile",
  templateUrl: "./profile.component.html",
  styleUrls: ["./profile.component.scss"],
  imports: [OfflineWarningCardComponent, ProfileCardComponent, MatButton],
})
export class ProfileComponent {
  private isDirty = false;
  constructor(private readonly auth: AuthService) {}

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
