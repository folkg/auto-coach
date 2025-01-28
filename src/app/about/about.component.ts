import { Component, computed, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatCardModule } from "@angular/material/card";
import { Spacetime } from "spacetime";

import { AppStatusService } from "../services/app-status.service";
import { Team } from "../services/interfaces/team";
import { RobotsComponent } from "../shared/robots/robots.component";
import { spacetimeNow } from "../shared/utils/now";
import {
  PauseLineupEvent,
  SetLineupEvent,
} from "../teams/interfaces/outputEvents";
import { RelativeDatePipe } from "../teams/pipes/relative-date.pipe";
import { TeamComponent } from "../teams/team/team.component";

@Component({
  selector: "app-about",
  templateUrl: "./about.component.html",
  styleUrls: ["./about.component.scss"],
  imports: [TeamComponent, RobotsComponent, MatCardModule],
  providers: [RelativeDatePipe],
})
export class AboutComponent {
  private readonly focus = toSignal(this.appStatusService.focus$);
  private readonly isSettingLineups = signal(true);
  private readonly lineupPausedAt = signal(-1);

  readonly sampleTimestamps = computed(() => [getNextUpdate(this.focus())]);
  readonly sampleTeam = computed(() =>
    getSampleTeam(this.isSettingLineups(), this.lineupPausedAt(), this.focus()),
  );

  constructor(readonly appStatusService: AppStatusService) {}

  setLineupBoolean($event: SetLineupEvent) {
    this.isSettingLineups.set($event.isSettingLineups);
  }

  togglePauseLineupActions($event: PauseLineupEvent) {
    const currentPaused = $event.team.lineup_paused_at;
    this.lineupPausedAt.set(currentPaused !== -1 ? -1 : Date.now());
  }
}

function getSampleTeam(
  isSettingLineups: boolean,
  lineupPausedAt: number,
  now = spacetimeNow(),
): Team {
  return {
    game_name: "Baseball",
    game_code: "mlb",
    game_season: new Date().getFullYear().toString(),
    game_is_over: false,
    team_key: "",
    team_name: "Bat Attitudes",
    team_url: "",
    team_logo: "https://s.yimg.com/cv/apiv2/default/mlb/mlb_12_j.png",
    league_name: "Dyanasty League",
    num_teams: 12,
    rank: 1,
    points_for: null,
    points_against: null,
    points_back: null,
    outcome_totals: {
      wins: "107",
      losses: "58",
      ties: "24",
      percentage: ".630",
    },
    scoring_type: "head",
    start_date: 0,
    end_date: 9999999999999,
    weekly_deadline: "intraday",
    waiver_rule: "all",
    faab_balance: -1,
    current_weekly_adds: 0,
    current_season_adds: 0,
    max_weekly_adds: -1,
    max_season_adds: -1,
    max_games_played: -1,
    max_innings_pitched: -1,
    edit_key: "",
    is_subscribed: true,
    is_setting_lineups: isSettingLineups,
    last_updated: getLastUpdate(now),
    allow_transactions: false,
    allow_dropping: false,
    allow_adding: false,
    allow_add_drops: false,
    allow_waiver_adds: false,
    uid: "",
    roster_positions: {},
    lineup_paused_at: lineupPausedAt,
  };
}

function getLastUpdate(now: Spacetime): number {
  const update = now.time("15:55");
  if (now.isAfter(update)) {
    return update.epoch;
  } else {
    return now.time("01:55").epoch;
  }
}

function getNextUpdate(now = spacetimeNow()): number {
  const update = now.time("15:55");
  if (now.isAfter(update)) {
    return now.add(1, "day").time("01:55").epoch;
  } else {
    return update.epoch;
  }
}
