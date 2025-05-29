import { isDefined } from "@common/utilities/checks.js";
import type {
  IPlayer,
  PlayerOwnership,
  PlayerRanks,
} from "../../../../../common/src/types/Player.js";
import {
  HEALTHY_STATUS_LIST,
  INACTIVE_POSITION_LIST,
  LONG_TERM_IL_POSITIONS_LIST,
} from "../helpers/constants.js";

/**
 * A class that extends the Player interface to add useful methods for
 * lineup Optimization.
 *
 * @export
 * @class OptimizationPlayer
 * @implements {Player}
 */
export class Player implements IPlayer {
  player_key: string;
  player_name: string;
  eligible_positions: string[];
  display_positions: string[];
  selected_position: string | null;
  is_editable: boolean;
  is_playing: boolean;
  injury_status: string;
  percent_started: number;
  percent_owned: number;
  percent_owned_delta: number;
  is_starting: string | number;
  is_undroppable: boolean;
  ranks: PlayerRanks;
  ownership: PlayerOwnership | null;

  start_score: number;
  ownership_score: number;

  constructor(player: IPlayer) {
    const playerCopy = structuredClone(player);

    this.player_key = playerCopy.player_key;
    this.player_name = playerCopy.player_name;
    this.eligible_positions = playerCopy.eligible_positions;
    this.display_positions = playerCopy.display_positions;
    this.selected_position = playerCopy.selected_position;
    this.is_editable = playerCopy.is_editable;
    this.is_playing = playerCopy.is_playing;
    this.injury_status = playerCopy.injury_status;
    this.percent_started = playerCopy.percent_started;
    this.percent_owned = playerCopy.percent_owned;
    this.percent_owned_delta = playerCopy.percent_owned_delta;
    this.is_starting = playerCopy.is_starting;
    this.is_undroppable = playerCopy.is_undroppable;
    this.ranks = playerCopy.ranks;
    this.ownership = playerCopy.ownership;

    this.start_score = playerCopy.start_score ?? 0;
    this.ownership_score = playerCopy.ownership_score ?? 0;
    if (!this.eligible_positions.includes("BN")) {
      this.eligible_positions.push("BN"); // not included by default in Yahoo
    }
  }

  public toPlainPlayerObject(): this {
    return structuredClone(this);
  }

  compareStartScore(playerB: Player): number {
    return this.compareScores(this.start_score, playerB.start_score);
  }

  compareOwnershipScore(playerB: Player): number {
    return this.compareScores(this.ownership_score, playerB.ownership_score);
  }

  private compareScores(num1: number, num2: number) {
    const FLOAT_EQUALITY_TOLERANCE = 1e-12;
    const scoreDiff = num1 - num2;
    if (Math.abs(scoreDiff) < FLOAT_EQUALITY_TOLERANCE) {
      return 0;
    }
    return scoreDiff;
  }

  isInactiveList(): boolean {
    return (
      isDefined(this.selected_position) &&
      INACTIVE_POSITION_LIST.includes(this.selected_position)
    );
  }

  isInactiveListEligible(): boolean {
    return this.eligible_positions.some((position) =>
      INACTIVE_POSITION_LIST.includes(position),
    );
  }

  isLTIR(): boolean {
    return this.eligible_positions.some((position) =>
      LONG_TERM_IL_POSITIONS_LIST.includes(position),
    );
  }

  isActiveRoster(): boolean {
    return (
      isDefined(this.selected_position) &&
      !INACTIVE_POSITION_LIST.includes(this.selected_position)
    );
  }

  isStartingRosterPlayer(): boolean {
    return (
      this.selected_position !== "BN" &&
      isDefined(this.selected_position) &&
      !INACTIVE_POSITION_LIST.includes(this.selected_position)
    );
  }

  isReservePlayer(): boolean {
    return !this.isStartingRosterPlayer();
  }

  isIllegalPosition(): boolean {
    return (
      this.selected_position === null ||
      !this.eligible_positions.includes(this.selected_position)
    );
  }

  isHealthy(): boolean {
    return HEALTHY_STATUS_LIST.includes(this.injury_status);
  }

  hasSameScoreAs(playerB: Player) {
    return this.compareStartScore(playerB) === 0;
  }

  isEligibleToSwapWith(playerB: Player): boolean {
    return (
      playerB !== this &&
      playerB.selected_position !== this.selected_position &&
      isDefined(playerB.selected_position) &&
      this.eligible_positions.includes(playerB.selected_position) &&
      isDefined(this.selected_position) &&
      playerB.eligible_positions.includes(this.selected_position)
    );
  }

  isEligibleAndHigherScoreThan(playerB: Player): boolean {
    return (
      this.compareStartScore(playerB) > 0 && this.isEligibleToSwapWith(playerB)
    );
  }

  getEligibleTargetPlayers(playersList: Player[]): Player[] {
    return playersList.filter(
      (targetPlayer) =>
        targetPlayer !== this &&
        targetPlayer.selected_position !== this.selected_position &&
        isDefined(targetPlayer.selected_position) &&
        this.eligible_positions.includes(targetPlayer.selected_position),
    );
  }

  findEligiblePositionIn(positionsList: string[]): string | undefined {
    return this.eligible_positions.find(
      (position) =>
        position !== this.selected_position && positionsList.includes(position),
    );
  }

  isEligibleForAnyPositionIn(positionsList: string[]): boolean {
    return positionsList.some((position) =>
      this.eligible_positions.includes(position),
    );
  }

  hasDisplayPositionIn(positionsList: string[]): boolean {
    return positionsList.some((position) =>
      this.display_positions?.includes(position),
    );
  }

  hasLowerStartScoreThanAll(playersList: Player[]): boolean {
    return playersList.every((player) => this.compareStartScore(player) <= 0);
  }

  hasLowerOwnershipScoreThanAll(playersList: Player[]): boolean {
    return playersList.every(
      (player) => this.compareOwnershipScore(player) <= 0,
    );
  }

  makeInelliglbeForIL(): void {
    this.eligible_positions = this.eligible_positions.filter(
      (position) => !INACTIVE_POSITION_LIST.includes(position),
    );
  }
}
