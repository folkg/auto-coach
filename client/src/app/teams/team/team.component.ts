import type { ClientTeam } from "@common/types/team";

import { AsyncPipe, DecimalPipe, NgIf } from "@angular/common";
import { Component, computed, EventEmitter, input, Output, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { MatButton, MatIconButton } from "@angular/material/button";
import {
  MatCard,
  MatCardActions,
  MatCardAvatar,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from "@angular/material/card";
import { MatDivider } from "@angular/material/divider";
import { MatIcon } from "@angular/material/icon";
import { MatSlideToggle, type MatSlideToggleChange } from "@angular/material/slide-toggle";
import { MatTooltip } from "@angular/material/tooltip";
import { Subscription } from "rxjs";
import spacetime, { type Spacetime } from "spacetime";

import type { PauseLineupEvent, SetLineupEvent } from "../interfaces/outputEvents";

import { AppStatusService } from "../../services/app-status.service";
import { NthPipe } from "../../shared/pipes/nth.pipe";
import { SCORING_TYPES } from "../../shared/utils/constants";
import { spacetimeNow } from "../../shared/utils/now";
import { RelativeDatePipe } from "../pipes/relative-date.pipe";

// server update is in Pacific Time, this is when yahoo resets for the day
const SERVER_UPDATE_MINUTE = 55;
const FIRST_SERVER_UPDATE_HOUR = 1;

@Component({
  selector: "app-team",
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
    NgIf,
    MatCardActions,
    MatSlideToggle,
    ReactiveFormsModule,
    FormsModule,
    MatButton,
    AsyncPipe,
    DecimalPipe,
    NthPipe,
    RelativeDatePipe,
  ],
})
export class TeamComponent {
  readonly team = input.required<Readonly<ClientTeam>>();
  readonly gameTimeStamps = input.required<number[] | null>();
  readonly loadingTimes = input(false);
  @Output() toggleSetLineupEvent = new EventEmitter<SetLineupEvent>();
  @Output() togglePauseLineupEvent = new EventEmitter<PauseLineupEvent>();

  private readonly focus = toSignal(this.appStatusService.focus$);
  readonly date = signal(spacetime.now().epoch);
  readonly nextLineupUpdate = computed(() =>
    this.getNextLineupUpdate(this.team().lineup_paused_at, this.focus()),
  );
  readonly isPausedToday = computed(() => this.isToday(this.team().lineup_paused_at, this.focus()));

  readonly scoringType = SCORING_TYPES;

  constructor(
    readonly appStatusService: AppStatusService,
    private readonly datePipe: RelativeDatePipe,
  ) {}

  private readonly subs = new Subscription();

  ngOnInit() {
    this.subs.add();
  }

  ngOnDestory() {
    this.subs.unsubscribe();
  }

  onToggleSetLineup($event: MatSlideToggleChange) {
    this.toggleSetLineupEvent.emit({
      team: this.team(),
      isSettingLineups: $event.checked,
    });
  }

  onTogglePauseLineup() {
    this.togglePauseLineupEvent.emit({
      team: this.team(),
    });
  }

  gotoExternalDomain(url: string) {
    if (url) {
      window.open(url, "_blank");
    }
  }

  private getNextLineupUpdate(lineupPausedAt: number, now = spacetimeNow()): string {
    const tomorrowMorning = this.datePipe.transform(
      now.add(1, "day").hour(FIRST_SERVER_UPDATE_HOUR).minute(SERVER_UPDATE_MINUTE).epoch,
    );

    if (this.isToday(lineupPausedAt)) {
      return tomorrowMorning;
    }

    const team = this.team();
    const gameTimeStamps = this.gameTimeStamps();

    const editKeyDate = spacetime(team.edit_key, "Canada/Pacific");
    const isWeeklyLeague = team.weekly_deadline !== "intraday" && team.weekly_deadline !== "";

    if (isWeeklyLeague) {
      let nextWeeklyUpdate: Spacetime = editKeyDate
        .hour(FIRST_SERVER_UPDATE_HOUR)
        .minute(SERVER_UPDATE_MINUTE);

      if (editKeyDate.day() === now.day()) {
        const firstGameTimestamp = gameTimeStamps?.[0];
        if (firstGameTimestamp !== undefined && firstGameTimestamp > now.epoch) {
          const firstGame: Spacetime = spacetime(firstGameTimestamp);
          return this.getUpdateBeforeGame(firstGame);
        }

        nextWeeklyUpdate = nextWeeklyUpdate.add(1, "week");
      }

      return this.datePipe.transform(nextWeeklyUpdate.epoch);
    }
    if (gameTimeStamps) {
      const nextGameTimestamp = gameTimeStamps.find((timestamp) => timestamp > now.epoch);
      if (nextGameTimestamp !== undefined) {
        const nextGame: Spacetime = spacetime(nextGameTimestamp);
        return this.getUpdateBeforeGame(nextGame);
      }
    }

    return tomorrowMorning;
  }

  private getUpdateBeforeGame(game: Spacetime): string {
    let updateTime = game.minute(SERVER_UPDATE_MINUTE);
    if (game.minute() < SERVER_UPDATE_MINUTE) {
      updateTime = updateTime.subtract(1, "hour");
    }
    return this.datePipe.transform(updateTime.epoch);
  }

  private isToday(timestamp: number, now = spacetimeNow()): boolean {
    if (timestamp === undefined || timestamp === -1) {
      return false;
    }
    const date = spacetime(timestamp, "Canada/Pacific");
    return now.isSame(date, "day");
  }
}
