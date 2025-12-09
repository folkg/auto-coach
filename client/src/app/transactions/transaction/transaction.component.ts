import type { TPlayer } from "@common/types/transactions";

import { NgClass } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatCheckbox, type MatCheckboxChange } from "@angular/material/checkbox";
import { MatIcon } from "@angular/material/icon";

import type { PlayerTransactionClient } from "../types/client-types";

import { PlayerComponent } from "../player/player.component";

@Component({
  selector: "app-transaction[transaction]",
  templateUrl: "./transaction.component.html",
  styleUrls: ["./transaction.component.scss"],
  imports: [NgClass, MatCheckbox, ReactiveFormsModule, FormsModule, MatIcon, PlayerComponent],
})
export class TransactionComponent {
  @Input({ required: true }) transaction!: PlayerTransactionClient;
  @Output() isSelected = new EventEmitter<{
    isSelected: boolean;
    transactionId: string;
  }>();

  onTransactionSelectChange($event: MatCheckboxChange) {
    this.isSelected.emit({
      isSelected: $event.checked,
      transactionId: this.transaction.id,
    });
  }

  getTransactionIcon(tPlayer: TPlayer): {
    icon: string;
    class: string;
  } {
    if (tPlayer.transactionType !== "add") {
      return { icon: "remove", class: "remove-icon" };
    }

    if (tPlayer.player.ownership?.ownership_type === "waivers") {
      return { icon: "schedule", class: "waiver-icon" };
    }

    return { icon: "add", class: "add-icon" };
  }
}
