import assert from "node:assert";
import { type } from "arktype";
import type { LeagueSpecificScarcityOffsets } from "../../calcPositionalScarcity/services/positionalScarcity.service.js";
import type { Player } from "../../common/classes/Player.js";
import { isDefined } from "../../common/helpers/checks.js";
import {
  COMPOUND_POSITION_COMPOSITIONS,
  INACTIVE_POSITION_LIST,
  POSITIONAL_MAX_EXTRA_PLAYERS,
} from "../../common/helpers/constants.js";
import type { SportLeague } from "../../common/interfaces/SportLeague.js";
import type {
  GamesPlayed,
  InningsPitched,
  TeamOptimizer,
} from "../../common/interfaces/Team.js";
import { ownershipScoreFunctionFactory } from "../../common/services/playerScoreFunctions/playerOwnershipScoreFunctions.service.js";
import { playerStartScoreFunctionFactory } from "../../common/services/playerScoreFunctions/playerStartScoreFunctions.service.js";
import {
  flattenArray,
  getNow,
  getProgressBetween,
  getWeeklyProgressPacific,
} from "../../common/services/utilities.service.js";
import type {
  TransactionDetails,
  TransactionPlayer,
} from "../../common/services/yahooAPI/yahooTeamProcesssing.services.js";
import { PlayerCollection } from "./PlayerCollection.js";

const TransactionPlayerInfoSchema = type({
  player_key: "string",
  display_position: "string",
});

export class Team extends PlayerCollection implements TeamOptimizer {
  coverage_type: string;
  coverage_period: string;
  transactions: TransactionDetails[];
  games_played?: GamesPlayed[] | undefined;
  innings_pitched?: InningsPitched | undefined;
  edit_key: string;
  faab_balance: number;
  current_weekly_adds: number;
  current_season_adds: number;
  scoring_type: string;
  team_name: string;
  league_name: string;
  max_weekly_adds: number;
  max_season_adds: number;
  waiver_rule: string;
  team_key: string;
  game_code: SportLeague;
  start_date: number;
  end_date: number;
  weekly_deadline: string;
  roster_positions: { [position: string]: number };
  num_teams: number;
  allow_transactions?: boolean | undefined;
  allow_dropping?: boolean | undefined;
  allow_adding?: boolean | undefined;
  allow_add_drops?: boolean | undefined;
  allow_waiver_adds?: boolean | undefined;
  automated_transaction_processing?: boolean | undefined;
  last_updated?: number | undefined;
  lineup_paused_at: number;

  private _editablePlayers: Player[];
  private _submittedAddDropDifferential = 0;
  private _pendingAddPlayers: Map<string, string[]> = new Map();
  private _pendingDropPlayers: Map<string, string[]> = new Map();
  private _lockedPlayers: Set<string> = new Set();
  private _numNewAdds = 0;

  constructor(
    team: TeamOptimizer,
    positionalScarcityOffsets?: LeagueSpecificScarcityOffsets,
  ) {
    const teamCopy = structuredClone(team);
    super(teamCopy.players);

    this.coverage_type = teamCopy.coverage_type;
    this.coverage_period = teamCopy.coverage_period;
    // Note: This should never really be undefined, but some old test data doesn't have it
    this.transactions = teamCopy.transactions ?? [];
    this.games_played = teamCopy.games_played;
    this.innings_pitched = teamCopy.innings_pitched;
    this.edit_key = teamCopy.edit_key;
    this.faab_balance = teamCopy.faab_balance;
    this.current_weekly_adds = teamCopy.current_weekly_adds;
    this.current_season_adds = teamCopy.current_season_adds;
    this.scoring_type = teamCopy.scoring_type;
    this.team_name = teamCopy.team_name;
    this.league_name = teamCopy.league_name;
    this.max_weekly_adds = teamCopy.max_weekly_adds;
    this.max_season_adds = teamCopy.max_season_adds;
    this.waiver_rule = teamCopy.waiver_rule;
    this.team_key = teamCopy.team_key;
    this.game_code = teamCopy.game_code;
    this.start_date = teamCopy.start_date;
    this.end_date = teamCopy.end_date;
    this.weekly_deadline = teamCopy.weekly_deadline;
    this.roster_positions = teamCopy.roster_positions;
    this.num_teams = teamCopy.num_teams;
    this.allow_transactions = teamCopy.allow_transactions;
    this.allow_dropping = teamCopy.allow_dropping;
    this.allow_adding = teamCopy.allow_adding;
    this.allow_add_drops = teamCopy.allow_add_drops;
    this.allow_waiver_adds = teamCopy.allow_waiver_adds;
    this.automated_transaction_processing =
      teamCopy.automated_transaction_processing;
    this.last_updated = teamCopy.last_updated;
    this.lineup_paused_at = teamCopy.lineup_paused_at ?? -1;

    this._editablePlayers = this.players.filter((player) => player.is_editable);

    this.ownershipScoreFunction = ownershipScoreFunctionFactory(
      this.num_teams * this.numStandardRosterSpots,
      positionalScarcityOffsets,
    );

    const playerStartScoreFunction = playerStartScoreFunctionFactory({
      gameCode: this.game_code,
      weeklyDeadline: this.weekly_deadline,
      ownershipScoreFunction: this.ownershipScoreFunction,
      seasonTimeProgress:
        (getNow() - this.start_date) / (this.end_date - this.start_date),
      gamesPlayed: this.games_played,
      inningsPitched: this.innings_pitched,
    });

    for (const player of this.players) {
      player.start_score = playerStartScoreFunction(player);
    }

    if (this.games_played) {
      this.artificiallyReduceRosterSpots();
    }

    this.processPendingTransactions();
  }

  private artificiallyReduceRosterSpots() {
    assert(this.games_played !== undefined);
    const BUFFER = 0.015;
    for (const position of this.games_played) {
      // Use a 1.5% buffer to allow for some day-to-day variance
      // Results in an 83.23 roster spot requirement for 82 games max, or 164.43 for 162 games max
      if (
        position.games_played.projected >
        position.games_played.max * (1 + BUFFER)
      ) {
        this.reduceAvailableRosterSpots(position.position, 1);
      }
    }
    if (this.innings_pitched !== undefined) {
      if (
        this.innings_pitched.projected >
        this.innings_pitched.max * (1 + BUFFER)
      ) {
        this.reduceAvailableRosterSpots("P", 1) ||
          this.reduceAvailableRosterSpots("RP", 1) ||
          this.reduceAvailableRosterSpots("SP", 1);
      }
    }
  }

  private reduceAvailableRosterSpots(position: string, quantity = 1): boolean {
    if (
      !INACTIVE_POSITION_LIST.includes(position) &&
      this.roster_positions[position] !== undefined
    ) {
      const reduction = Math.min(quantity, this.roster_positions[position]);
      this.roster_positions[position] -= reduction;
      this.roster_positions.BN += reduction;
      return true;
    }
    return false;
  }

  private processPendingTransactions(): void {
    for (const transaction of this.transactions ?? []) {
      const playersObject = transaction[1].players;
      const isPendingTransaction = ["pending"].includes(transaction[0].status); // "propsed" as well for if they're in a trade??

      for (const key in playersObject) {
        const player = playersObject[key];
        if (typeof player !== "number") {
          const playerInTransaction = player.player;
          this.makeTransactionPlayerInelligible(playerInTransaction);
          this.changePendingAddDrops(isPendingTransaction, playerInTransaction);
        }
      }
    }
  }

  private makeTransactionPlayerInelligible(
    playerInTransaction: TransactionPlayer,
  ) {
    const matchingTeamPlayer = this.players.find(
      (player) =>
        player.player_key === flattenArray(playerInTransaction[0]).player_key,
    );

    if (!matchingTeamPlayer?.isInactiveList()) {
      matchingTeamPlayer?.makeInelliglbeForIL();
    }
  }

  private changePendingAddDrops(
    isPendingTransaction: boolean,
    playerInTransaction: TransactionPlayer,
  ) {
    const player = TransactionPlayerInfoSchema.assert(
      flattenArray(playerInTransaction[0]),
    );
    const playerKey = player.player_key;
    const eligiblePositions = player.display_position.split(",");
    // sometimes transaction_data is an array of size 1, sometimes just the object. Why, Yahoo?
    let transactionData = playerInTransaction[1].transaction_data;
    if (Array.isArray(transactionData)) {
      transactionData = transactionData[0];
    }

    const isAddingPlayer =
      transactionData.destination_team_key === this.team_key;

    // only adjust pendingAddDropDifferential count for officially "pending" transactions, not "proposed" trades
    if (isAddingPlayer) {
      if (isPendingTransaction) {
        this._submittedAddDropDifferential += 1;
        this._pendingAddPlayers.set(playerKey, eligiblePositions);
      }
    } else {
      if (isPendingTransaction) {
        this._submittedAddDropDifferential -= 1;
        this._pendingDropPlayers.set(playerKey, eligiblePositions);
      }
      this._lockedPlayers.add(playerKey);
    }
  }

  public get allPendingAddDropDifferential(): number {
    return this._pendingAddPlayers.size - this._pendingDropPlayers.size;
  }

  public addPendingAdd(player: Player): void {
    const { player_key: playerKey, eligible_positions: eligiblePositions } =
      player;
    this._pendingAddPlayers.set(playerKey, eligiblePositions);
    this._numNewAdds += 1;
  }

  public get pendingAddPlayerKeys(): string[] {
    return Array.from(this._pendingAddPlayers.keys());
  }

  public addPendingDrop(player: Player): void {
    const { player_key: playerKey, eligible_positions: eligiblePositions } =
      player;
    this._lockedPlayers.add(playerKey);
    this._pendingDropPlayers.set(playerKey, eligiblePositions);
  }

  public get pendingLockedPlayerKeys(): string[] {
    return Array.from(this._lockedPlayers);
  }

  /**
   * Returns a deep clone of the team as an ITeam object
   *
   * @public
   * @return {TeamOptimizer}
   */
  public toPlainTeamObject(): TeamOptimizer {
    const { _editablePlayers, _ownershipScoreFunction, ...team } = this;
    return structuredClone(team) as TeamOptimizer;
  }

  public get positionCounts(): { [position: string]: number } {
    const result: { [position: string]: number } = {};

    for (const player of this.players) {
      for (const position of player.eligible_positions) {
        result[position] = (result[position] ?? 0) + 1;
      }
    }

    return result;
  }

  public get sameDayTransactions(): boolean {
    return (
      (this.weekly_deadline === "" || this.weekly_deadline === "intraday") &&
      this.edit_key === this.coverage_period
    );
  }

  public get editablePlayers(): Player[] {
    return this._editablePlayers;
  }

  public get droppablePlayers(): Player[] {
    return this.droppablePlayersInclIL.filter(
      (player) => !player.isInactiveList(),
    );
  }

  public get droppablePlayersInclIL(): Player[] {
    return this.players.filter(
      (player) =>
        !(player.is_undroppable || this._lockedPlayers.has(player.player_key)),
    );
  }

  public get illegalPlayers(): Player[] {
    return this._editablePlayers.filter(
      (player) =>
        player.selected_position === null ||
        !player.eligible_positions.includes(player.selected_position),
    );
  }

  public get startingPlayers(): Player[] {
    return this._editablePlayers.filter(
      (player) =>
        isDefined(player.selected_position) &&
        !INACTIVE_POSITION_LIST.includes(player.selected_position) &&
        player.selected_position !== "BN",
    );
  }

  /**
   * players on the reserve list, which includes players on the inactive list
   * and players on the bench
   *
   * @public
   * @readonly
   * @type {Player[]}
   */
  public get reservePlayers(): Player[] {
    return this._editablePlayers.filter((player) => player.isReservePlayer());
  }

  public get inactiveListEligiblePlayers(): Player[] {
    return this._editablePlayers.filter((player) =>
      player.isInactiveListEligible(),
    );
  }

  public get inactiveOnRosterPlayers(): Player[] {
    return this._editablePlayers.filter(
      (player) =>
        player.isActiveRoster() &&
        player.eligible_positions.some((position) =>
          INACTIVE_POSITION_LIST.includes(position),
        ),
    );
  }

  public get healthyOnIL(): Player[] {
    return this._editablePlayers.filter(
      (player) => player.isHealthy() && player.isInactiveList(),
    );
  }

  public get unfilledPositionCounter(): { [key: string]: number } {
    const result = { ...this.roster_positions };
    for (const player of this.players) {
      if (
        isDefined(player.selected_position) &&
        result[player.selected_position] !== undefined
      ) {
        result[player.selected_position]--;
      }
    }
    return result;
  }

  public get unfilledAllPositions(): string[] {
    return Object.keys(this.unfilledPositionCounter).filter(
      (position) => this.unfilledPositionCounter[position] > 0,
    );
  }

  public get unfilledStartingPositions(): string[] {
    return Object.keys(this.unfilledPositionCounter).filter(
      (position) =>
        position !== "BN" &&
        !INACTIVE_POSITION_LIST.includes(position) &&
        this.unfilledPositionCounter[position] > 0,
    );
  }

  public get unfilledInactivePositions(): string[] {
    return Object.keys(this.unfilledPositionCounter).filter(
      (position) =>
        INACTIVE_POSITION_LIST.includes(position) &&
        this.unfilledPositionCounter[position] > 0,
    );
  }

  public get overfilledPositions(): string[] {
    return Object.keys(this.unfilledPositionCounter).filter(
      (position) =>
        position !== "BN" && this.unfilledPositionCounter[position] < 0,
    );
  }

  public get currentEmptyRosterSpots(): number {
    return this.emptyRosterSpotCounter() - this._submittedAddDropDifferential;
  }

  public getPendingEmptyRosterSpots(): number {
    return this.emptyRosterSpotCounter() - this.allPendingAddDropDifferential;
  }

  private emptyRosterSpotCounter(): number {
    const unfilledPositions = this.unfilledPositionCounter;
    return Object.keys(unfilledPositions).reduce(
      (acc, position) =>
        !INACTIVE_POSITION_LIST.includes(position)
          ? acc + unfilledPositions[position]
          : acc,
      0,
    );
  }

  public get numStandardRosterSpots(): number {
    return Object.keys(this.roster_positions).reduce(
      (acc, position) =>
        !INACTIVE_POSITION_LIST.includes(position)
          ? acc + this.roster_positions[position]
          : acc,
      0,
    );
  }

  /**
   * positions that currently are underfilled, or exactly filled
   *
   * @public
   * @readonly
   * @type {string[]}
   */
  public get criticalPositions(): string[] {
    return this.getPositionsHelper((count, capacity) => count <= capacity);
  }

  /**
   * positions that would be critical if one player was dropped
   *
   * @public
   * @readonly
   * @type {string[]}
   */
  public get almostCriticalPositions(): string[] {
    return this.getPositionsHelper((count, capacity) => count <= capacity + 1);
  }

  /**
   * positions that have at least one empty spot that no current roster player can fill
   *
   * @public
   * @readonly
   * @type {string[]}
   */
  public get underfilledPositions(): string[] {
    return this.getPositionsHelper((count, capacity) => count < capacity);
  }

  /**
   * positions that already meet or exceed the maximum capacity for that position (if applicable)
   *
   * @public
   * @readonly
   * @type {string[]} positions that are at or over max capacity
   */
  public get atMaxCapPositions(): string[] {
    return this.getPositionsHelper(
      (count, capacity, position) =>
        count >=
        capacity + POSITIONAL_MAX_EXTRA_PLAYERS[this.game_code][position],
    );
  }

  private getPositionsHelper(
    compareFn: (count: number, capacity: number, position: string) => boolean,
  ): string[] {
    const result: string[] = [];

    // validPlayerKeysWithPositions: string[playerKey] = [eligiblePositions]
    const validPlayerKeysWithPositions: string[][] =
      this.getValidPlayerKeysWithEligiblePositions();

    const positionPlayerCapacity: { [position: string]: number } =
      this.getPlayerCapacityAtPosition();

    for (const position in positionPlayerCapacity) {
      if (Object.hasOwn(positionPlayerCapacity, position)) {
        const playerKeysAtPosition = validPlayerKeysWithPositions.filter(
          (eligiblePositions) => eligiblePositions.includes(position),
        );
        if (
          compareFn(
            playerKeysAtPosition.length,
            positionPlayerCapacity[position],
            position,
          )
        ) {
          result.push(position);
        }
      }
    }

    return result;
  }

  private getValidPlayerKeysWithEligiblePositions(): string[][] {
    return this.players
      .filter(
        (player) =>
          !(player.isLTIR() || this._pendingDropPlayers.has(player.player_key)),
      )
      .map((player) => {
        const {
          eligible_positions: eligiblePositions,
          display_positions: displayPositions = [], // We need a default because not all players in the test files have this property, it was added later
        } = player;
        return [...new Set([...eligiblePositions, ...displayPositions])];
      })
      .concat(Array.from(this._pendingAddPlayers.values()));
  }

  private getPlayerCapacityAtPosition() {
    const compoundPositions = COMPOUND_POSITION_COMPOSITIONS[this.game_code];

    const positions = Object.keys(this.roster_positions).filter(
      (position) => !INACTIVE_POSITION_LIST.includes(position),
    );

    const result = positions.reduce(
      (acc: { [position: string]: number }, position: string) => {
        acc[position] = this.roster_positions[position];
        const isCompoundPosition =
          Object.keys(compoundPositions).includes(position);
        if (isCompoundPosition) {
          const childPositions: string[] = compoundPositions[position];
          for (const childPosition of childPositions) {
            acc[position] += this.roster_positions[childPosition] ?? 0;
          }
        }
        return acc;
      },
      {},
    );

    // Limit the capacity of specific sub-positions to the max capacity of the parent compound positions
    // even if they don't explicitly exist in the league settings
    // Example: A league with one QB/WR/RB/TE spot but zero QB spots, we still want to limit the number of QBs
    // as defined by the POSITIONAL_MAX_EXTRA_PLAYERS["QB"] value
    const extraPositionsToCheck = Object.keys(
      POSITIONAL_MAX_EXTRA_PLAYERS[this.game_code],
    ).filter((position) => !Object.keys(result).includes(position));

    for (const extraPosition of extraPositionsToCheck) {
      const parentPositions = Object.keys(compoundPositions).filter(
        (parentPosition) =>
          compoundPositions[parentPosition].includes(extraPosition),
      );

      if (parentPositions.length === 0) {
        continue;
      }

      result[extraPosition] ??= 0;
      for (const parentPosition of parentPositions) {
        result[extraPosition] += this.roster_positions[parentPosition] ?? 0;
      }
    }

    return result;
  }

  public getPlayersAt(position: string): Player[] {
    return this._editablePlayers.filter(
      (player) => player.selected_position === position,
    );
  }

  public isCurrentTransactionPaceOK(): boolean {
    const {
      start_date: startDate,
      end_date: endDate,
      current_weekly_adds: currrentWeeklyAdds,
      max_weekly_adds: maxWeeklyAdds,
      current_season_adds: currentSeasonAdds,
      max_season_adds: maxSeasonAdds,
      _numNewAdds: newAdds,
    } = this;

    let weeklyPaceExceeded = false;
    let seasonPaceExceeded = false;

    if (maxWeeklyAdds > 0) {
      weeklyPaceExceeded = isToleranceExceeded(
        currrentWeeklyAdds + newAdds,
        maxWeeklyAdds,
        getWeeklyProgressPacific(),
      );
    }

    if (maxSeasonAdds > 0) {
      seasonPaceExceeded = isToleranceExceeded(
        currentSeasonAdds + newAdds,
        maxSeasonAdds,
        getProgressBetween(startDate, endDate),
      );
    }

    return weeklyPaceExceeded === false && seasonPaceExceeded === false;

    function isToleranceExceeded(
      currentAdds: number,
      maxAdds: number,
      progress: number,
    ) {
      const TOLERANCE = 0.1;

      // the fewer the number of remaining adds, the less tolerance we allow
      const dynamicTolerance = TOLERANCE * (maxAdds - currentAdds);

      const isPastTolerance =
        currentAdds >= progress * maxAdds + dynamicTolerance;
      const oneTransactionLeft = currentAdds >= maxAdds - 1;

      return isPastTolerance || oneTransactionLeft;
    }
  }
}
