import { NgIf } from "@angular/common";
import { Component, type OnInit, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from "@angular/material/card";
// biome-ignore lint/style/useImportType: This is an injection token
import { MatDialog } from "@angular/material/dialog";
import type { Schedule } from "@common/types/Schedule";
import { lastValueFrom } from "rxjs";
import { ProfileCardComponent } from "../profile/profile-card/profile-card.component";
// biome-ignore lint/style/useImportType: This is an injection token
import { APIService } from "../services/api.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { AppStatusService } from "../services/app-status.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { AuthService } from "../services/auth.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { SyncTeamsService } from "../services/sync-teams.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";
import { OfflineWarningCardComponent } from "../shared/offline-warning-card/offline-warning-card.component";
import { getErrorMessage, logError } from "../shared/utils/error";
import type {
  PauseLineupEvent,
  SetLineupEvent,
} from "./interfaces/outputEvents";
import { RelativeDatePipe } from "./pipes/relative-date.pipe";
import { TeamComponent } from "./team/team.component";

@Component({
  selector: "app-teams",
  templateUrl: "./teams.component.html",
  styleUrls: ["./teams.component.scss"],
  providers: [RelativeDatePipe],
  imports: [
    OfflineWarningCardComponent,
    NgIf,
    ProfileCardComponent,
    TeamComponent,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
  ],
})
export class TeamsComponent implements OnInit {
  readonly user = toSignal(this.auth.user$);
  readonly teams = toSignal(this.syncTeamsService.teams$, { initialValue: [] });
  readonly loading = toSignal(this.syncTeamsService.loading$, {
    initialValue: false,
  });
  readonly schedule = signal<Schedule | null>(null);
  private readonly isDirty = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly api: APIService,
    readonly syncTeamsService: SyncTeamsService,
    readonly dialog: MatDialog,
    readonly appStatusService: AppStatusService,
  ) {}

  ngOnInit(): void {
    this.fetchLeagueSchedules().catch(logError);
  }

  private async fetchLeagueSchedules() {
    if (!this.schedule()) {
      try {
        this.schedule.set(await this.api.fetchSchedules());
      } catch (err) {
        await this.errorDialog(
          `${getErrorMessage(err)} Please ensure you are connected to the internet and try again later.`,
          "ERROR Fetching Schedules",
        );
      }
    }
  }

  async setLineupBoolean($event: SetLineupEvent): Promise<void> {
    const teamKey = $event.team.team_key;
    const changeTo = $event.isSettingLineups;

    try {
      await this.api.setLineupsBoolean(teamKey, changeTo);
      this.syncTeamsService.optimisticallyUpdateTeam(
        teamKey,
        "is_setting_lineups",
        changeTo,
      );
    } catch (_ignore) {
      this.syncTeamsService.optimisticallyUpdateTeam(
        teamKey,
        "is_setting_lineups",
        !changeTo,
      );
      await this.errorDialog(
        "Could not update team's status on the server. Please check your internet connection and try again later.",
      );
    } finally {
      this.syncTeamsService.refreshTeams();
    }
  }

  async setPauseLineupActions($event: PauseLineupEvent): Promise<void> {
    const teamKey = $event.team.team_key;

    const initialPauseState = $event.team.lineup_paused_at;
    const isPaused =
      initialPauseState !== undefined && initialPauseState !== -1;

    try {
      this.syncTeamsService.optimisticallyUpdateTeam(
        teamKey,
        "lineup_paused_at",
        isPaused ? -1 : Date.now(),
      );
      await this.api.setPauseLineupActions(teamKey, !isPaused);
    } catch (_ignore) {
      this.syncTeamsService.optimisticallyUpdateTeam(
        teamKey,
        "lineup_paused_at",
        initialPauseState,
      );
      await this.errorDialog(
        "Could not update team's status on the server. Please check your internet connection and try again later.",
      );
    } finally {
      this.syncTeamsService.refreshTeams();
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
