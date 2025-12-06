import type { ClientTeam } from "@common/types/team";

import { DecimalPipe } from "@angular/common";
import { Component, computed, EventEmitter, Input, input, Output } from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import {
  MatCard,
  MatCardAvatar,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from "@angular/material/card";
import { MatDivider } from "@angular/material/divider";
import { MatIcon } from "@angular/material/icon";
import { MatTooltip } from "@angular/material/tooltip";

import type { PlayerTransactionClient } from "../types/client-types";

import { NthPipe } from "../../shared/pipes/nth.pipe";
import { SCORING_TYPES } from "../../shared/utils/constants";
import { TransactionComponent } from "../transaction/transaction.component";

@Component({
  selector: "app-team[team][allTransactions]",
  templateUrl: "./team.component.html",
  styleUrls: ["./team.component.scss"],
  imports: [
    MatCard,
    MatCardHeader,
    MatCardAvatar,
    MatCardTitle,
    MatCardSubtitle,
    MatIconButton,
    MatTooltip,
    MatIcon,
    MatDivider,
    MatCardContent,
    TransactionComponent,
    DecimalPipe,
    NthPipe,
  ],
})
export class TeamComponent {
  @Input({ required: true }) team!: ClientTeam;
  allTransactions = input.required<PlayerTransactionClient[]>();
  @Output() transactionSelected = new EventEmitter<{
    isSelected: boolean;
    transactionId: string;
  }>();

  readonly transactions = computed(() =>
    this.allTransactions().filter((transaction) => transaction.teamKey === this.team.team_key),
  );

  readonly scoringType = SCORING_TYPES;

  onSelectTransaction($event: { isSelected: boolean; transactionId: string }) {
    this.transactionSelected.emit($event);
  }

  gotoExternalDomain(url: string) {
    if (url) {
      window.open(url, "_blank");
    }
  }
}
