import { AsyncPipe, NgIf } from "@angular/common";
import {
  Component,
  EventEmitter,
  type OnDestroy,
  type OnInit,
  Output,
  signal,
} from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButton } from "@angular/material/button";
import {
  MatCard,
  MatCardActions,
  MatCardAvatar,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from "@angular/material/card";
import { MatError, MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import type { User } from "@firebase/auth";
import { Subscription, distinctUntilChanged, map } from "rxjs";
import { assertDefined } from "../../shared/utils/checks";
import { logError } from "../../shared/utils/error";

// biome-ignore lint/style/useImportType: This is an injection token
import { AppStatusService } from "../../services/app-status.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { AuthService } from "../../services/auth.service";

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
  ],
})
export class ProfileCardComponent implements OnInit, OnDestroy {
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

  constructor(
    private readonly auth: AuthService,
    readonly appStatusService: AppStatusService,
  ) {}

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
  }

  async saveChanges() {
    try {
      const emailAddress = this.profileForm.value.email;
      assertDefined(emailAddress, "Email address is required");
      await this.auth.updateUserEmail(emailAddress);
      this.isEditing.set(false);
      this.profileForm.markAsPristine();
    } catch (err) {
      logError(err, "Error updating email:");
    }
  }

  async sendVerificationEmail(): Promise<void> {
    await this.auth.sendVerificationEmail();
  }
}
