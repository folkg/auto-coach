import { Component, input } from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import {
  MatCard,
  MatCardActions,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from "@angular/material/card";
import { MatDivider } from "@angular/material/divider";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: "app-skeleton-card",
  templateUrl: "./skeleton-card.component.html",
  styleUrls: ["./skeleton-card.component.scss"],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardSubtitle,
    MatCardContent,
    MatCardActions,
    MatDivider,
    MatIconButton,
    MatIcon,
  ],
})
export class SkeletonCardComponent {
  readonly showTransactions = input(false);
}
