import { CdkTextareaAutosize } from "@angular/cdk/text-field";
import { AsyncPipe } from "@angular/common";
import { Component, signal, ViewChild } from "@angular/core";
import { FormsModule, type NgForm, ReactiveFormsModule } from "@angular/forms";
import { MatButton } from "@angular/material/button";
import { MatChipListbox, MatChipOption } from "@angular/material/chips";
import { MatFormField, MatLabel } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import { LoaderComponent } from "../loader/loader.component";
import { APIService } from "../services/api.service";
import { AppStatusService } from "../services/app-status.service";
import { AuthService } from "../services/auth.service";
import { OfflineWarningCardComponent } from "../shared/offline-warning-card/offline-warning-card.component";

const FEEDBACK_TYPES = ["General", "Bug Report", "Feature Request"];

@Component({
  selector: "app-feedback",
  templateUrl: "./feedback.component.html",
  styleUrls: ["./feedback.component.scss"],
  imports: [
    LoaderComponent,
    OfflineWarningCardComponent,
    ReactiveFormsModule,
    FormsModule,
    MatChipListbox,
    MatChipOption,
    MatFormField,
    MatLabel,
    MatInput,
    CdkTextareaAutosize,
    MatButton,
    AsyncPipe,
  ],
})
export class FeedbackComponent {
  feedback = "";
  title = "";
  honeypot = ""; //bots will likely fill this in
  feedbackType = "General";
  readonly feedbackTypes = FEEDBACK_TYPES;

  readonly submitted = signal(false);
  readonly success = signal<boolean | undefined>(undefined);

  @ViewChild("feedbackForm") feedbackForm: NgForm | undefined;

  constructor(
    private readonly api: APIService,
    private readonly auth: AuthService,
    readonly appStatusService: AppStatusService,
  ) {}

  async onSubmitCloudFunction(): Promise<void> {
    this.submitted.set(true);

    if (this.honeypot !== "") {
      this.success.set(false);
      return;
    }

    const user = await this.auth.getUser();

    const emailBody = `${user.displayName}\n${user.uid}\n\n${this.feedback}`;

    this.api
      .sendFeedbackEmail({
        userEmail: user.email ?? "unknown email",
        feedbackType: this.feedbackType,
        title: this.title,
        message: emailBody,
      })
      .then((result) => {
        this.success.set(result);
      })
      .catch(() => {
        this.success.set(false);
      });
  }

  public canDeactivate(): boolean {
    return this.feedbackForm?.pristine ?? this.submitted();
  }
}
