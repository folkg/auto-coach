import { NgIf } from "@angular/common";
import { Component, computed, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCard } from "@angular/material/card";
import { MatDialog } from "@angular/material/dialog";
import { lastValueFrom } from "rxjs";

import type { PauseLineupEvent, SetLineupEvent } from "./interfaces/outputEvents";

import { ProfileCardComponent } from "../profile/profile-card/profile-card.component";
import { APIService } from "../services/api.service";
import { AppStatusService } from "../services/app-status.service";
import { AuthService } from "../services/auth.service";
import { SyncTeamsService } from "../services/sync-teams.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";
import { OfflineWarningCardComponent } from "../shared/offline-warning-card/offline-warning-card.component";
import { RelativeDatePipe } from "./pipes/relative-date.pipe";
import { TeamComponent } from "./team/team.component";

@Component({
  selector: "app-teams",
  templateUrl: "./teams.component.html",
  styleUrls: ["./teams.component.scss"],
  providers: [RelativeDatePipe],
  imports: [OfflineWarningCardComponent, NgIf, ProfileCardComponent, TeamComponent, MatCard],
})
export class TeamsComponent {
  readonly user = toSignal(this.auth.user$);
  readonly teamsState = toSignal(this.syncTeamsService.teamsState$);
  readonly teams = computed(() => this.teamsState()?.teams ?? []);
  readonly schedule = computed(() => this.teamsState()?.schedule);
  readonly showInitialSkeleton = computed(() => this.teamsState()?.status === "loading-initial");
  readonly isLoadingTimes = computed(() => this.teamsState()?.status === "loading-times");
  private readonly isDirty = signal(false);

  readonly skeletonCards = [1, 2, 3];

  constructor(
    private readonly auth: AuthService,
    private readonly api: APIService,
    readonly syncTeamsService: SyncTeamsService,
    readonly dialog: MatDialog,
    readonly appStatusService: AppStatusService,
  ) {}

  async setLineupBoolean($event: SetLineupEvent): Promise<void> {
    const teamKey = $event.team.team_key;
    const changeTo = $event.isSettingLineups;

    // Optimistic update first for immediate UI response
    this.syncTeamsService.optimisticallyUpdateTeam(teamKey, "is_setting_lineups", changeTo);

    try {
      await this.api.setLineupsBoolean(teamKey, changeTo);
    } catch (_ignore) {
      // Revert optimistic update on error
      this.syncTeamsService.optimisticallyUpdateTeam(teamKey, "is_setting_lineups", !changeTo);
      await this.errorDialog(
        "Could not update team's status on the server. Please check your internet connection and try again later.",
      );
    }
  }

  async setPauseLineupActions($event: PauseLineupEvent): Promise<void> {
    const teamKey = $event.team.team_key;

    const initialPauseState = $event.team.lineup_paused_at;
    const isPaused = initialPauseState !== undefined && initialPauseState !== -1;

    // Optimistic update first for immediate UI response
    this.syncTeamsService.optimisticallyUpdateTeam(
      teamKey,
      "lineup_paused_at",
      isPaused ? -1 : Date.now(),
    );

    try {
      await this.api.setPauseLineupActions(teamKey, !isPaused);
    } catch (_ignore) {
      // Revert optimistic update on error
      this.syncTeamsService.optimisticallyUpdateTeam(
        teamKey,
        "lineup_paused_at",
        initialPauseState,
      );
      await this.errorDialog(
        "Could not update team's status on the server. Please check your internet connection and try again later.",
      );
    }
  }

  onDirtyChange(dirty: boolean): void {
    this.isDirty.set(dirty);
  }

  canDeactivate(): boolean {
    return !this.isDirty();
  }

  private errorDialog(
    message: string,
    title = "ERROR",
    trueButton = "OK",
    falseButton: string | null = null,
  ): Promise<boolean> {
    const dialogData: DialogData = {
      title,
      message,
      trueButton: trueButton,
    };
    if (falseButton !== null) {
      dialogData.falseButton = falseButton;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      minWidth: "350px",
      width: "90%",
      maxWidth: "500px",
      data: dialogData,
    });

    return lastValueFrom(dialogRef.afterClosed());
  }
}
