import type { IPlayer } from "@common/types/Player";

import { DecimalPipe, NgClass } from "@angular/common";
import { Component, Input, signal } from "@angular/core";
import { MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: "app-player[player]",
  templateUrl: "./player.component.html",
  styleUrls: ["./player.component.scss"],
  imports: [NgClass, MatIconButton, MatIcon, DecimalPipe],
})
export class PlayerComponent {
  @Input() player!: IPlayer;
  @Input() isAdding = false;
  public readonly expanded = signal(false);

  toggleExpanded() {
    this.expanded.update((value) => !value);
  }

  get playerPositions(): string {
    return this.player.eligible_positions.filter((p) => p !== "BN").join(", ");
  }

  get playerOwnership(): string {
    if (this.player.ownership?.ownership_type === "waivers") {
      return `Waivers until ${this.player.ownership.waiver_date}`;
    }
    if (this.player.ownership?.ownership_type === "freeagents") {
      return "Free Agent";
    }
    return "";
  }
}
