import type { User } from "firebase/auth";

import { AsyncPipe, NgIf } from "@angular/common";
import {
  Component,
  EventEmitter,
  inject,
  type OnDestroy,
  type OnInit,
  Output,
  signal,
} from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import {
  MatCard,
  MatCardActions,
  MatCardAvatar,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from "@angular/material/card";
import { MatDialog } from "@angular/material/dialog";
import { MatError, MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { MatTooltipModule } from "@angular/material/tooltip";
import { assertDefined } from "@common/utilities/checks";
import { getErrorMessage } from "@common/utilities/error";
import { distinctUntilChanged, map, Subscription } from "rxjs";

import { AppStatusService } from "../../services/app-status.service";
import { AuthService } from "../../services/auth.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../../shared/confirm-dialog/confirm-dialog.component";

@Component({
  selector: "app-profile-card",
  templateUrl: "./profile-card.component.html",
  styleUrls: ["./profile-card.component.scss"],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardAvatar,
    MatCardTitle,
    MatCardContent,
    NgIf,
    ReactiveFormsModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatError,
    MatButton,
    MatCardActions,
    AsyncPipe,
    MatTooltipModule,
  ],
  standalone: true,
})
export class ProfileCardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  readonly appStatusService = inject(AppStatusService);
  private readonly dialog = inject(MatDialog);

  emailFormControl = new FormControl("", [
    Validators.required,
    Validators.pattern("^[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,4}$"),
  ]);
  profileForm = new FormGroup({
    email: this.emailFormControl,
  });
  readonly user = signal<User | null>(null);
  readonly isEditing = signal(false);
  @Output() isDirty = new EventEmitter<boolean>();

  readonly resendInProgress = signal(false);

  private readonly subs = new Subscription();

  ngOnInit(): void {
    this.subs.add(
      this.auth.user$.subscribe((user) => {
        this.user.set(user);
        if (user) {
          this.profileForm.patchValue({
            email: user.email,
          });
        }
      }),
    );

    this.subs.add(
      this.profileForm.statusChanges
        .pipe(
          map(() => this.profileForm.dirty),
          distinctUntilChanged(),
        )
        .subscribe((isDirty) => {
          this.isDirty.emit(isDirty);
        }),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  toggleEdit() {
    this.isEditing.update((isEditing) => !isEditing);
  }

  cancelChanges() {
    this.isEditing.set(false);
    this.profileForm.reset({ email: this.user()?.email ?? null });
    this.profileForm.markAsPristine();
    this.isDirty.emit(false);
  }

  async saveChanges() {
    try {
      const emailAddress = this.profileForm.value.email;
      assertDefined(emailAddress, "Email address is required");
      await this.auth.updateUserEmail(emailAddress);
      this.isEditing.set(false);
      this.profileForm.markAsPristine();
      this.isDirty.emit(false);
      this.errorDialog(
        `A verification email has been sent to ${emailAddress}. Please check your inbox and click the verification link to complete the email change.`,
        "Email Update Sent",
      );
    } catch (err) {
      this.errorDialog(getErrorMessage(err), "Error updating email");
    }
  }

  private errorDialog(message: string, title = "ERROR"): void {
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

  async sendVerificationEmail(): Promise<void> {
    if (this.resendInProgress()) {
      return;
    }
    this.resendInProgress.set(true);
    try {
      await this.auth.sendVerificationEmail();
      this.errorDialog(
        "Verification email sent. Please check your inbox (and spam folder).",
        "Verification Email Sent",
      );
    } catch (err) {
      this.errorDialog(getErrorMessage(err), "Error sending verification email");
    } finally {
      this.resendInProgress.set(false);
    }
  }
}
