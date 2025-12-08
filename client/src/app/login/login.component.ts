import { Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButton } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { RouterLink } from "@angular/router";
import { getErrorMessage } from "@common/utilities/error";

import { LoaderOverlayComponent } from "../loader-overlay/loader-overlay.component";
import { AuthService } from "../services/auth.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";
import { RobotsComponent } from "../shared/robots/robots.component";

@Component({
  selector: "app-login",
  templateUrl: "./login.component.html",
  styleUrls: ["./login.component.scss"],
  imports: [MatButton, RouterLink, RobotsComponent, LoaderOverlayComponent],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  readonly dialog = inject(MatDialog);

  loading = toSignal(this.auth.loading$, { initialValue: false });

  login() {
    this.auth.loginYahoo().catch((err) => {
      const errorMessage = getErrorMessage(err);
      if (errorMessage.includes("Authentication was cancelled")) {
        this.errorDialog(
          "The sign-in popup was closed before authentication could complete. Please try again and keep the popup open until you're redirected back.",
          "Sign In Interrupted",
        );
      } else if (errorMessage.includes("popup-blocked")) {
        this.errorDialog(
          "The sign-in popup was blocked by your browser. Please allow popups for this site and try again.",
          "Popup Blocked",
        );
      } else {
        this.errorDialog(errorMessage);
      }
    });
  }

  logout() {
    this.auth.logout().catch((err) => this.errorDialog(getErrorMessage(err)));
  }

  errorDialog(message: string, title = "ERROR"): void {
    const dialogData: DialogData = {
      title,
      message,
      trueButton: "OK",
    };
    this.dialog.open(ConfirmDialogComponent, {
      minWidth: "350px",
      width: "90%",
      maxWidth: "500px",
      data: dialogData,
    });
  }
}
