import { Component, input } from "@angular/core";

@Component({
  selector: "app-skeleton-card",
  templateUrl: "./skeleton-card.component.html",
  styleUrls: ["./skeleton-card.component.scss"],
})
export class SkeletonCardComponent {
  readonly showTransactions = input(false);
}
