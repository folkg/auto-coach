import { Component } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButton } from "@angular/material/button";
// biome-ignore lint/style/useImportType: This is an injection token
import { MatDialog } from "@angular/material/dialog";
import { RouterLink } from "@angular/router";
import { getErrorMessage } from "@common/utilities/error";
import { LoaderOverlayComponent } from "../loader-overlay/loader-overlay.component";
// biome-ignore lint/style/useImportType: This is an injection token
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
  loading = toSignal(this.auth.loading$, { initialValue: false });

  constructor(
    private readonly auth: AuthService,
    readonly dialog: MatDialog,
  ) {}

  login() {
    this.auth
      .loginYahoo()
      .catch((err) => this.errorDialog(getErrorMessage(err)));
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
