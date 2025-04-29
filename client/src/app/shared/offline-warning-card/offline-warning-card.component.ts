import { AsyncPipe, NgIf } from "@angular/common";
import { Component } from "@angular/core";
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from "@angular/material/card";

// biome-ignore lint/style/useImportType: This is an injection token
import { AppStatusService } from "../../services/app-status.service";

@Component({
  selector: "app-offline-warning-card",
  templateUrl: "./offline-warning-card.component.html",
  styleUrls: ["./offline-warning-card.component.scss"],
  imports: [
    NgIf,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    AsyncPipe,
  ],
})
export class OfflineWarningCardComponent {
  constructor(public appStatusService: AppStatusService) {}
}
