import { logger } from "firebase-functions";
import assert from "node:assert";
import type { IPlayer } from "@common/types/Player.js";
import type { TeamOptimizer } from "@common/types/team.js";
import type { LineupChanges, PlayerTransaction } from "@common/types/transactions.js";
import { isDefined } from "@common/utilities/checks.js";
import type { LeagueSpecificScarcityOffsets } from "../../calcPositionalScarcity/services/positionalScarcity.service.js";
import { Player } from "../../common/classes/Player.js";
import { INACTIVE_POSITION_LIST } from "../../common/helpers/constants.js";
import { PlayerCollection } from "./PlayerCollection.js";
import { PlayerTransactions } from "./PlayerTransactions.js";
import { Team } from "./Team.js";

// The number of points the score of an add candidate must be above a potential drop candidate.
// This adds a conservative bias to the algorithm to avoid making bad drops.
const SCORE_THRESHOLD = 6;

export class LineupOptimizer {
  private readonly team: Team;
  private readonly originalPlayerPositions: { [playerKey: string]: string };
  private deltaPlayerPositions: { [playerKey: string]: string };
  private readonly _playerTransactions: PlayerTransactions;
  private _addCandidates: PlayerCollection | undefined;

  public verbose = false;
  private logInfo(...args: unknown[]) {
    if (this.verbose) {
      logger.info(...args);
    }
  }

  constructor(team: TeamOptimizer, positionalScarcityOffsets?: LeagueSpecificScarcityOffsets) {
    this.team = new Team(team, positionalScarcityOffsets);
    this._playerTransactions = new PlayerTransactions();
    this.originalPlayerPositions = this.createPlayerPositionDictionary(this.team.editablePlayers);
    this.deltaPlayerPositions = {};
  }

  public getCurrentTeamState(): TeamOptimizer {
    return this.team.toPlainTeamObject();
  }

  public get teamObject(): Team {
    return new Team(this.getCurrentTeamState());
  }

  public optimizeStartingLineup(): void {
    if (this.team.editablePlayers.length === 0) {
      this.logInfo(`no players to optimize for team ${this.team.team_key}`);
      return;
    }

    this.logInfo("optimizing starting lineup for team", this.team.team_key);

    this.resolveOverfilledPositions();
    this.resolveAllIllegalPlayers();
    this.optimizeReserveToStaringPlayers();

    this.generateDeltaPlayerPositions();
  }

  private generateDeltaPlayerPositions() {
    this.deltaPlayerPositions = diffPlayerPositionDictionary(
      this.originalPlayerPositions,
      this.createPlayerPositionDictionary(this.team.editablePlayers),
    );

    function diffPlayerPositionDictionary(
      originalPlayerPositions: { [playerKey: string]: string },
      finalPlayerPositions: { [playerKey: string]: string },
    ) {
      const result: { [playerKey: string]: string } = {};
      for (const playerKey in originalPlayerPositions) {
        const originalPosition = originalPlayerPositions[playerKey];
        const finalPosition = finalPlayerPositions[playerKey];
        if (originalPosition !== finalPosition && finalPosition) {
          result[playerKey] = finalPosition;
        }
      }
      return result;
    }
  }

  private createPlayerPositionDictionary(players: Player[]) {
    const result: { [playerKey: string]: string } = {};
    for (const player of players) {
      if (isDefined(player.selected_position)) {
        result[player.player_key] = player.selected_position;
      }
    }
    return result;
  }

  public get lineupChanges(): LineupChanges | null {
    if (Object.keys(this.deltaPlayerPositions).length > 0) {
      return {
        teamKey: this.team.team_key,
        coverageType: this.team.coverage_type,
        coveragePeriod: this.team.coverage_period,
        newPlayerPositions: this.deltaPlayerPositions,
      };
    }
    return null;
  }

  public shouldPostLineupChanges(): boolean {
    if (Object.keys(this.deltaPlayerPositions).length === 0) {
      return false;
    }

    for (const playerKey in this.deltaPlayerPositions) {
      const player = this.team.editablePlayers.find((p) => p.player_key === playerKey);
      if (!player) {
        continue;
      }

      const originalPosition = this.originalPlayerPositions[playerKey];
      const newPosition = this.deltaPlayerPositions[playerKey];

      if (!(originalPosition && newPosition)) {
        continue;
      }

      const wasStarting =
        originalPosition !== "BN" && !INACTIVE_POSITION_LIST.includes(originalPosition);
      const isStarting = newPosition !== "BN" && !INACTIVE_POSITION_LIST.includes(newPosition);

      const involvesInactiveList =
        INACTIVE_POSITION_LIST.includes(originalPosition) ||
        INACTIVE_POSITION_LIST.includes(newPosition);
      if (involvesInactiveList) {
        return true;
      }

      if (wasStarting === false && isStarting === true && player.is_playing === true) {
        return true;
      }
    }

    return false;
  }

  private resolveOverfilledPositions(): void {
    const overfilledPositions = this.team.overfilledPositions;
    for (const position of overfilledPositions) {
      // this.team.unfilledPositionCounter is recalculated on each call based on changes within loop
      while ((this.team.unfilledPositionCounter[position] ?? 0) < 0) {
        const worstPlayerAtPosition = Team.sortAscendingByStartScore(
          this.team.getPlayersAt(position),
        )[0];
        if (!worstPlayerAtPosition) {
          break;
        }
        this.movePlayerToPosition(worstPlayerAtPosition, "BN");
      }
    }
  }

  public get playerTransactions(): PlayerTransaction[] | null {
    if (this._playerTransactions.transactions.length > 0) {
      return this._playerTransactions.transactions;
    }
    return null;
  }

  public set addCandidates(candidates: IPlayer[]) {
    assert(candidates.length > 0, "addCandidates must have at least one player");

    const addCandidates = new PlayerCollection(candidates);

    addCandidates.ownershipScoreFunction = this.team.ownershipScoreFunction;

    addCandidates.filterPlayers(
      (player) => !(this.team.pendingAddPlayerKeys.includes(player.player_key) || player.isLTIR()),
    );
    if (this.team.allow_waiver_adds === false) {
      addCandidates.filterPlayers((player) => player.ownership?.ownership_type !== "waivers");
    }

    addCandidates.sortDescByOwnershipScoreAndRemoveDuplicates();

    this._addCandidates = addCandidates;
  }

  public get addCandidates(): PlayerCollection | undefined {
    return this._addCandidates;
  }

  public generateDropPlayerTransactions(): void {
    // find drops by attempting to move healthy players off IL unsuccessfully
    this.logInfo("generateDropPlayerTransactions for team", this.team.team_key);
    const healthyPlayersOnIL = this.team.healthyOnIL;
    if (healthyPlayersOnIL.length === 0) {
      return;
    }

    Team.sortDescendingByStartScore(healthyPlayersOnIL);
    for (const player of healthyPlayersOnIL) {
      const success = this.resolveIllegalPlayer(player);
      if (!success) {
        this.createDropPlayerTransaction(player);
        this.resolveIllegalPlayer(player); // now that a player has been dropped, resolve our player again.
      }
    }

    // we don't need to generateDeltaPlayerPositions() on drop transactions since the transactions need to be posted before optimizing
  }

  private isAddingAllowed(): boolean {
    if (!(this._addCandidates && this.isRosterLegal() && this.team.isCurrentTransactionPaceOK())) {
      return false;
    }
    return true;
  }

  public generateAddPlayerTransactions(): void {
    this.logInfo("generateAddPlayerTransactions for team", this.team.team_key);
    if (!this.isAddingAllowed()) {
      return;
    }

    const reasonsList: string[] = [];
    for (let i = this.team.getPendingEmptyRosterSpots(); i > 0; i--) {
      reasonsList.push("There is an empty spot on the roster. A new player can be added.");
    }

    // free up as many roster spots as possible
    let playerMovedToIL: Player | null = this.openOneRosterSpot();
    while (playerMovedToIL !== null) {
      reasonsList.push(
        `Moving ${playerMovedToIL.player_name} (${playerMovedToIL.eligible_positions.join(
          ", ",
        )}) [${playerMovedToIL.ownership_score.toFixed(
          2,
        )}] to the inactive list. A new player can be added.`,
      );

      playerMovedToIL = this.openOneRosterSpot();
    }

    if (this.team.getPendingEmptyRosterSpots() === 0) {
      return;
    }

    while (this.team.getPendingEmptyRosterSpots() > 0 && this.team.isCurrentTransactionPaceOK()) {
      const result = this.createAddPlayerTransaction(reasonsList.shift());
      if (!result) {
        break;
      }
    }

    this.generateDeltaPlayerPositions();
  }

  private createAddPlayerTransaction(reason: string | null = null): boolean {
    assert(this._addCandidates, "addCandidates must be set");

    const currentCandidates = this.preprocessAddCandidates(this._addCandidates.allPlayers);

    const playerToAdd = currentCandidates[0];
    if (!playerToAdd) {
      return false;
    }

    const underfilledPositions: string[] = this.team.underfilledPositions;
    let transactionReason = reason;
    if (underfilledPositions.length > 0) {
      transactionReason = `There are empty ${underfilledPositions.join(
        ", ",
      )} positions on the roster. ${transactionReason}`;
    }

    const pt: PlayerTransaction = {
      teamKey: this.team.team_key,
      sameDayTransactions: this.team.sameDayTransactions,
      description: `${transactionReason ?? ""} Adding ${
        playerToAdd.player_name
      } (${playerToAdd.eligible_positions.join(
        ", ",
      )}) [${playerToAdd.ownership_score.toFixed(2)}] ${
        playerToAdd.ownership?.ownership_type === "waivers"
          ? "(Waiver Claim)"
          : "(Free Agent Pickup)"
      }`,
      reason: transactionReason,
      isFaabRequired: this.team.faab_balance !== -1,
      players: [
        {
          playerKey: playerToAdd.player_key,
          transactionType: "add",
          isInactiveList: false,
          player: playerToAdd.toPlainPlayerObject(),
          isFromWaivers: playerToAdd.ownership?.ownership_type === "waivers",
        },
      ],
      teamName: this.team.team_name,
      leagueName: this.team.league_name,
    };
    this._playerTransactions.addTransaction(pt);

    this.team.addPendingAdd(playerToAdd);
    this._addCandidates.removePlayer(playerToAdd);

    this.logInfo(
      `Added a new transaction from generateAddPlayerTransactions: ${JSON.stringify(pt)}`,
    );

    return true;
  }

  public generateSwapPlayerTransactions(): void {
    this.logInfo("generateSwapPlayerTransactions for team", this.team.team_key);
    if (!this.isAddingAllowed()) {
      return;
    }

    let { baseDropCandidates, baseAddCandidates } = this.getBaseAddDropCandidates();

    if (baseAddCandidates.length === 0 || baseDropCandidates.length === 0) {
      return;
    }

    while (this.team.isCurrentTransactionPaceOK()) {
      const result = this.createSwapPlayerTransaction(
        baseAddCandidates,
        baseDropCandidates,
        SCORE_THRESHOLD,
      );
      if (!result) {
        break;
      }
      baseAddCandidates = result[0];
      baseDropCandidates = result[1];
    }

    this.generateDeltaPlayerPositions();
  }

  public getBaseAddDropCandidates() {
    if (!this._addCandidates) {
      return { baseDropCandidates: [], baseAddCandidates: [] };
    }

    const bestAddCandidate = this._addCandidates.allPlayers[0];
    if (!bestAddCandidate) {
      return { baseDropCandidates: [], baseAddCandidates: [] };
    }

    let baseDropCandidates: Player[] = PlayerCollection.sortAscendingByOwnershipScore(
      this.team.droppablePlayersInclIL,
    );
    baseDropCandidates = baseDropCandidates.filter(
      (dropCandidate) =>
        !this.isTooLateToDrop(dropCandidate) &&
        bestAddCandidate.compareOwnershipScore(dropCandidate) > SCORE_THRESHOLD,
    );

    this.logInfo("Base drop candidates:");
    for (const player of baseDropCandidates) {
      this.logInfo(`${player.player_name} ${player.ownership_score} ${player.eligible_positions}`);
    }
    const worstDropCandidate: Player | undefined = baseDropCandidates?.[0];
    if (!worstDropCandidate) {
      return { baseDropCandidates: [], baseAddCandidates: [] };
    }
    const baseAddCandidates: Player[] = this._addCandidates.allPlayers.filter(
      (addCandidate) => addCandidate.compareOwnershipScore(worstDropCandidate) > SCORE_THRESHOLD,
    );

    this.logInfo("Base add candidates:");
    for (const player of baseAddCandidates) {
      this.logInfo(`${player.player_name} ${player.ownership_score} ${player.eligible_positions}`);
    }

    return {
      baseDropCandidates,
      baseAddCandidates,
    };
  }

  private createSwapPlayerTransaction(
    baseAddCandidates: Player[],
    baseDropCandidates: Player[],
    SCORE_THRESHOLD: number,
  ): [Player[], Player[]] | null {
    assert(this._addCandidates, "addCandidates must be set");

    const addCandidates = this.preprocessAddCandidates(baseAddCandidates);
    const playerToAdd: Player | undefined = addCandidates?.[0]; // best add candidate
    if (!playerToAdd) {
      return null;
    }

    const teamCriticalPositions: string[] = this.team.almostCriticalPositions;
    const addPlayerCriticalPositions: string[] = playerToAdd.eligible_positions.filter((pos) =>
      teamCriticalPositions.includes(pos),
    );
    let areCriticalPositionsReplaced: boolean;

    this.logInfo("Team critical positions", teamCriticalPositions);
    this.logInfo(`Current add candidate ${playerToAdd.player_name}`);
    this.logInfo("addPlayerCriticalPositions", addPlayerCriticalPositions);

    this.logInfo("baseDropCandidates", baseDropCandidates.length);
    const dropCandidates: Player[] = baseDropCandidates.filter(
      (dropCandidate) => playerToAdd.compareOwnershipScore(dropCandidate) > SCORE_THRESHOLD,
    );
    let playerToDrop: Player | undefined;
    do {
      playerToDrop = dropCandidates.shift();
      if (!playerToDrop) {
        return null;
      }

      const dropPlayerCriticalPositions: string[] = playerToDrop.eligible_positions.filter((pos) =>
        teamCriticalPositions.includes(pos),
      );
      this.logInfo(`Current drop candidate ${playerToDrop.player_name}`);
      this.logInfo("dropPlayerCriticalPositions", dropPlayerCriticalPositions);

      areCriticalPositionsReplaced = dropPlayerCriticalPositions.every((pos) =>
        addPlayerCriticalPositions.includes(pos),
      );
      if (!areCriticalPositionsReplaced) {
        continue;
      }

      if (playerToDrop.isInactiveList()) {
        this.logInfo("attempting to resolve IL player");
        // attempts to swap with a player on the active roster, removing them from the inactive list
        if (!this.moveILPlayerToUnfilledALPosition(playerToDrop)) {
          this.attemptIllegalPlayerSwaps(playerToDrop);
        }
      }

      this.logInfo("areCriticalPositionsReplaced", areCriticalPositionsReplaced);
      this.logInfo("playerToDrop.isInactiveList()", playerToDrop.isInactiveList());
    } while (!areCriticalPositionsReplaced || playerToDrop.isInactiveList());

    this.logInfo("Swap:", playerToAdd.player_name, playerToDrop.player_name);

    const underfilledPositions: string[] = this.team.underfilledPositions;
    let description = `Adding ${playerToAdd.player_name} (${playerToAdd.eligible_positions.join(
      ", ",
    )}) [${playerToAdd.ownership_score.toFixed(2)}] and dropping ${
      playerToDrop.player_name
    } (${playerToDrop.eligible_positions.join(
      ", ",
    )}) [${playerToDrop.ownership_score.toFixed(2)}]. ${
      playerToAdd.ownership?.ownership_type === "waivers" ? "(Waiver Claim)" : "(Free Agent Pickup)"
    }`;

    let reason: string | null = null;
    if (underfilledPositions.length > 0) {
      reason = `There are empty ${underfilledPositions.join(", ")} positions on the roster.`;
      description = `${reason} ${description}`;
    }

    const pt: PlayerTransaction = {
      teamKey: this.team.team_key,
      sameDayTransactions: this.team.sameDayTransactions,
      description: description,
      reason: reason,
      isFaabRequired: this.team.faab_balance !== -1,
      players: [
        {
          playerKey: playerToAdd.player_key,
          transactionType: "add",
          isInactiveList: false,
          player: playerToAdd.toPlainPlayerObject(),
          isFromWaivers: playerToAdd.ownership?.ownership_type === "waivers",
        },
        {
          playerKey: playerToDrop.player_key,
          transactionType: "drop",
          isInactiveList: false,
          player: playerToDrop.toPlainPlayerObject(),
        },
      ],
      teamName: this.team.team_name,
      leagueName: this.team.league_name,
    };
    this._playerTransactions.addTransaction(pt);

    this.logInfo(
      `Added a new transaction from generateSwapPlayerTransactions: ${JSON.stringify(pt)}`,
    );

    this.team.addPendingAdd(playerToAdd);
    this.team.addPendingDrop(playerToDrop);

    this._addCandidates.removePlayer(playerToAdd);

    const resultAddCandidates = baseAddCandidates.filter(
      (player) => player.player_key !== playerToAdd.player_key,
    );
    const resultDropCandidates = baseDropCandidates.filter(
      (player) => player.player_key !== playerToDrop?.player_key,
    );
    return [resultAddCandidates, resultDropCandidates];
  }

  private preprocessAddCandidates(addCandidates: Player[]): Player[] {
    let result = this.filterForUnderfilledPositions(addCandidates);
    result = this.filterOutOverMaxCapPositions(result);
    result = this.addBonusForCriticalPositions(result);
    return PlayerCollection.sortDescendingByOwnershipScore(result);
  }

  private filterForUnderfilledPositions(addCandidates: Player[]): Player[] {
    const underfilledPositions: string[] = this.team.underfilledPositions;
    const filtered = addCandidates.filter((player) =>
      player.isEligibleForAnyPositionIn(underfilledPositions),
    );

    return filtered.length === 0 ? addCandidates : filtered;
  }

  private filterOutOverMaxCapPositions(addCandidates: Player[]): Player[] {
    const overMaxCapPositions: string[] = this.team.atMaxCapPositions;
    const filtered = addCandidates.filter(
      (player) =>
        !(
          player.isEligibleForAnyPositionIn(overMaxCapPositions) ||
          player.hasDisplayPositionIn(overMaxCapPositions)
        ),
    );

    return filtered;
  }

  private addBonusForCriticalPositions(addCandidates: Player[]): Player[] {
    const criticalPositions: string[] = this.team.criticalPositions;

    if (criticalPositions.length === 0) {
      return addCandidates;
    }

    return addCandidates.map((player) => {
      if (player.isEligibleForAnyPositionIn(criticalPositions)) {
        const playerCopy = new Player(player);
        playerCopy.ownership_score += 5;
        return playerCopy;
      }
      return player;
    });
  }

  private resolveAllIllegalPlayers(): void {
    const illegalPlayers = this.team.illegalPlayers;
    if (illegalPlayers.length === 0) {
      return;
    }

    Team.sortDescendingByStartScore(illegalPlayers);
    this.logInfo(
      `Resolving illegal players: ${illegalPlayers.map((p) => p.player_name).join(", ")}`,
    );
    for (const player of illegalPlayers) {
      this.resolveIllegalPlayer(player);
    }
  }

  private resolveIllegalPlayer(player: Player): boolean {
    this.logInfo(`Resolving illegal player: ${player.player_name}`);
    // an illegalPlayer may have been resolved in a previous swap
    if (!player.isIllegalPosition()) {
      return true;
    }

    let success: boolean;
    let unfilledPositionTargetList: string[];

    if (player.isInactiveList()) {
      success = this.moveILPlayerToUnfilledALPosition(player);
      if (success) {
        return true;
      }

      unfilledPositionTargetList = this.team.unfilledInactivePositions;
    } else {
      unfilledPositionTargetList = this.team.unfilledStartingPositions;
    }

    success = this.movePlayerToUnfilledPositionInTargetList(player, unfilledPositionTargetList);
    if (success) {
      return true;
    }

    success = this.attemptIllegalPlayerSwaps(player);
    if (success) {
      return true;
    }

    return false;
  }

  private attemptIllegalPlayerSwaps(playerA: Player): boolean {
    const eligibleSwapPlayers = this.team.editablePlayers.filter(
      (player) => !this.team.pendingLockedPlayerKeys.includes(player.player_key),
    );
    Team.sortAscendingByStartScore(eligibleSwapPlayers);

    if (eligibleSwapPlayers.length === 0) {
      return false;
    }

    for (const playerB of eligibleSwapPlayers) {
      if (playerA === playerB) {
        continue;
      }
      this.logInfo(`comparing ${playerA.player_name} to ${playerB.player_name}`);

      if (playerA.isEligibleToSwapWith(playerB)) {
        this.swapPlayers(playerA, playerB);
        return true;
      }
      const success = this.threeWaySwapIllegalPlayer(playerA, playerB, eligibleSwapPlayers);
      if (success) {
        return true;
      }

      this.threeWayMoveIllegalToUnfilledPosition(playerA, playerB);
    }
    this.logInfo(`no swaps found for ${playerA.player_name}`);
    return false;
  }

  private threeWayMoveIllegalToUnfilledPosition(playerA: Player, playerB: Player) {
    const potentialPlayerAPosition = playerB.isActiveRoster() ? "BN" : playerB.selected_position;

    if (
      potentialPlayerAPosition === null ||
      !playerA.eligible_positions.includes(potentialPlayerAPosition)
    ) {
      return;
    }

    this.logInfo(`attempting to move playerB ${playerB.player_name} to unfilled position`);
    const illegalPlayerACannotMoveToOpenRosterSpot =
      playerA.isInactiveList() && this.team.getPendingEmptyRosterSpots() <= 0;

    const unfilledPositionTargetList = illegalPlayerACannotMoveToOpenRosterSpot
      ? this.team.unfilledInactivePositions
      : this.team.unfilledAllPositions;
    const success = this.movePlayerToUnfilledPositionInTargetList(
      playerB,
      unfilledPositionTargetList,
    );
    if (success) {
      this.movePlayerToPosition(playerA, potentialPlayerAPosition);
    }
  }
  private threeWaySwapIllegalPlayer(
    playerA: Player,
    playerB: Player,
    eligiblePlayerCs: Player[],
  ): boolean {
    this.logInfo("attempting to find a three way swap");
    const playerC = this.findPlayerCforIllegalPlayerA(playerA, playerB, eligiblePlayerCs);
    if (playerC) {
      this.logInfo("three-way swap found!");
      if (playerA.isInactiveList() && playerB.isActiveRoster()) {
        this.movePlayerToPosition(playerB, "BN");
      }
      this.swapPlayers(playerA, playerB);
      this.swapPlayers(playerB, playerC);
      return true;
    }
    return false;
  }

  private optimizeReserveToStaringPlayers(): void {
    const reservePlayers = this.team.reservePlayers;
    Team.sortAscendingByStartScore(reservePlayers);
    this.logInfo(`reserve players: ${reservePlayers.map((p) => p.player_name)}`);

    while (reservePlayers.length > 0) {
      const playerA: Player | undefined = reservePlayers.pop();
      if (!playerA) {
        break;
      }
      if (playerA.isStartingRosterPlayer()) {
        continue;
      }
      this.logInfo(`playerA: ${playerA.player_name}`);

      let proceedToLookForUnfilledPositionInStarters = true;
      if (playerA.isInactiveList()) {
        proceedToLookForUnfilledPositionInStarters = this.moveILPlayerToUnfilledALPosition(playerA);
      }
      const success =
        proceedToLookForUnfilledPositionInStarters &&
        this.movePlayerToUnfilledPositionInTargetList(playerA, this.team.unfilledStartingPositions);

      if (success) {
        continue;
      }

      const playerMovedToReserve = this.swapWithStartingPlayers(playerA);
      if (playerMovedToReserve) {
        // if a player was swapped back into the reserve list, we need to
        // re-evaluate the player we just swapped to see if it can be moved back
        reservePlayers.push(playerMovedToReserve);
      } else {
        this.logInfo(`No swaps for playerA: ${playerA.player_name}`);
      }
    }
  }

  private swapWithStartingPlayers(playerA: Player): Player | undefined {
    const eligibleTargetPlayers = this.getEliglibleStartingPlayers(playerA);
    if (!eligibleTargetPlayers || eligibleTargetPlayers.length === 0) {
      return undefined;
    }

    for (const playerB of eligibleTargetPlayers) {
      if (playerA.isEligibleAndHigherScoreThan(playerB)) {
        this.swapPlayers(playerA, playerB);
        return playerB;
      }
      let playerMovedToReserve = this.threeWaySwap(playerA, playerB);
      if (playerMovedToReserve) {
        return playerMovedToReserve;
      }

      playerMovedToReserve = this.threeWayMoveToUnfilledPosition(playerA, playerB);
      // only return playerB to go back into the reserve list if it was moved to the IL
      if (playerMovedToReserve?.isInactiveList()) {
        return playerMovedToReserve;
      }
      if (playerMovedToReserve?.isStartingRosterPlayer()) {
        return undefined;
      }
    }
    return undefined;
  }

  private getEliglibleStartingPlayers(playerA: Player): Player[] | undefined {
    // TODO: Can this be moved to the Team class?
    // TODO: Modify this for our new partial optimization functionality. We don't just want all starting players,
    // we want only the starting players that have no game, not starting, or not in HEALTHY_STATUS_LIST
    // This way, we will only swap out starting players that are not playing, we don't care about score
    const startingPlayersList = this.team.startingPlayers;
    Team.sortAscendingByStartScore(startingPlayersList);

    if (playerA.hasLowerStartScoreThanAll(startingPlayersList)) {
      this.logInfo(
        `Player ${playerA.player_name} ${playerA.start_score} is worse than all players in target array. Skipping.`,
      );
      return undefined;
    }

    const result = playerA.getEligibleTargetPlayers(startingPlayersList);
    this.logInfo(
      `eligibleTargetPlayers for player ${playerA.player_name}: ${result.map(
        (p) => p.player_name,
      )}`,
    );
    return result;
  }

  private threeWayMoveToUnfilledPosition(playerA: Player, playerB: Player): Player | undefined {
    this.logInfo(
      `attempting to move playerB ${playerB.player_name} to unfilled position, and playerA ${playerA.player_name} to playerB's old position.`,
    );
    let unfilledPositionTargetList: string[];
    if (playerA.isInactiveList()) {
      if (playerA.compareStartScore(playerB) === 0) {
        return undefined;
      }
      unfilledPositionTargetList = this.team.unfilledInactivePositions;
    } else {
      unfilledPositionTargetList = this.team.unfilledStartingPositions;
    }
    const playerBOriginalPosition = playerB.selected_position;
    const success = this.movePlayerToUnfilledPositionInTargetList(
      playerB,
      unfilledPositionTargetList,
    );
    if (isDefined(playerBOriginalPosition) && success) {
      this.movePlayerToPosition(playerA, playerBOriginalPosition);
      return playerB;
    }
    return undefined;
  }

  private threeWaySwap(playerA: Player, playerB: Player): Player | undefined {
    this.logInfo("attempting to find a three way swap");
    const playerCTargetList: Player[] = playerA.isInactiveList()
      ? this.team.inactiveListEligiblePlayers
      : this.team.startingPlayers;

    const playerC = this.findPlayerCforOptimization(playerA, playerB, playerCTargetList);
    if (playerC) {
      const playerMovedToReserve = playerA.isInactiveList() ? playerB : playerC;
      this.swapPlayers(playerA, playerB);
      this.swapPlayers(playerB, playerC);
      return playerMovedToReserve;
    }
    return undefined;
  }

  private movePlayerToPosition(player: Player, position: string): void {
    this.logInfo(`moving player ${player.player_name} to position ${position}`);
    player.selected_position = position;
  }

  private swapPlayers(playerA: Player, playerB: Player): void {
    this.logInfo(
      `swapping ${playerA.player_name} ${playerA.selected_position} with ${playerB.player_name} ${playerB.selected_position}`,
    );
    if (playerA.selected_position === null || playerB.selected_position === null) {
      throw new Error(
        `missing position when swapping ${playerA.player_name} ${playerA.selected_position} with ${playerB.player_name} ${playerB.selected_position}`,
      );
    }
    const temp = playerB.selected_position;

    this.movePlayerToPosition(playerB, playerA.selected_position);
    this.movePlayerToPosition(playerA, temp);
  }

  private openOneRosterSpot(playerToOpenSpotFor?: Player): Player | null {
    const unfilledInactivePositions: string[] = this.team.unfilledInactivePositions;
    if (unfilledInactivePositions.length === 0) {
      return null;
    }

    let inactivePlayersOnRoster: Player[] = this.team.inactiveOnRosterPlayers;
    if (playerToOpenSpotFor) {
      inactivePlayersOnRoster = inactivePlayersOnRoster.filter(
        (player) => playerToOpenSpotFor.compareStartScore(player) > 0,
      );
    }
    Team.sortAscendingByStartScore(inactivePlayersOnRoster);

    for (const inactivePlayer of inactivePlayersOnRoster) {
      const eligiblePosition = inactivePlayer.findEligiblePositionIn(unfilledInactivePositions);
      if (eligiblePosition) {
        this.logInfo(`freeing up one roster spot: ${inactivePlayer.selected_position}`);
        this.movePlayerToPosition(inactivePlayer, eligiblePosition);
        return inactivePlayer;
      }
    }

    return null;
  }

  /**
   * Drops the lowest scoring player that is not undroppable or in a critical
   * position. If playerToOpenSpotFor is provided, it will only drop players
   * that have a lower ownership score than playerToOpenSpotFor.
   *
   * This function will not immediately drop the player, but will instead add a
   * transaction to the transaction list to be processed by the caller.
   *
   *
   * @param {Player} playerToOpenSpotFor
   */
  private createDropPlayerTransaction(playerToOpenSpotFor: Player): void {
    const playerToDrop = this.getPlayerToDrop(playerToOpenSpotFor);
    this.logInfo(`playerToDrop: ${playerToDrop.player_name}`);

    if (playerToDrop === playerToOpenSpotFor) {
      return;
    }
    if (!playerToDrop.ownership_score) {
      return; // in case of Yahoo API error
    }

    const reason = `${
      playerToOpenSpotFor.player_name
    } (${playerToOpenSpotFor.eligible_positions.join(
      ", ",
    )}) [${playerToOpenSpotFor.ownership_score.toFixed(
      2,
    )}] is coming back from injury and moving to the active roster.`;

    const description = `Dropping ${
      playerToDrop.player_name
    } (${playerToDrop.eligible_positions.join(
      ", ",
    )}) [${playerToDrop.ownership_score.toFixed(2)}]. ${reason}`;

    const pt: PlayerTransaction = {
      teamKey: this.team.team_key,
      sameDayTransactions: this.team.sameDayTransactions,
      description: description,
      reason: reason,
      players: [
        {
          playerKey: playerToDrop.player_key,
          transactionType: "drop",
          isInactiveList: playerToDrop.isInactiveList(),
          player: playerToDrop.toPlainPlayerObject(),
        },
      ],
      teamName: this.team.team_name,
      leagueName: this.team.league_name,
    };
    this._playerTransactions.addTransaction(pt);

    this.team.addPendingDrop(playerToDrop);

    this.logInfo(`Added a new transaction from dropPlayerToWaivers: ${JSON.stringify(pt)}`);
  }

  private getPlayerToDrop(playerToOpenSpotFor: Player) {
    return this.team.droppablePlayers
      .filter(
        (player) =>
          !(
            this.isTooLateToDrop(player) ||
            player.eligible_positions.some((position) =>
              this.team.almostCriticalPositions.includes(position),
            )
          ),
      )
      .reduce(
        (prevPlayer, currPlayer) =>
          prevPlayer.compareOwnershipScore(currPlayer) < 0 ? prevPlayer : currPlayer,
        playerToOpenSpotFor,
      );
  }

  private isTooLateToDrop(player: Player) {
    return this.team.sameDayTransactions && !player.is_editable;
  }

  private movePlayerToUnfilledPositionInTargetList(
    player: Player,
    unfilledPositionTargetList: string[],
  ): boolean {
    const unfilledPosition = player.findEligiblePositionIn(unfilledPositionTargetList);
    this.logInfo(`unfilledPosition: ${unfilledPosition}`);

    if (!unfilledPosition) {
      return false;
    }

    this.movePlayerToPosition(player, unfilledPosition);
    return true;
  }

  private moveILPlayerToUnfilledALPosition(player: Player): boolean {
    assert(player.isInactiveList, "calling function must pass an IL player");

    this.logInfo(`numEmptyRosterSpots ${this.team.getPendingEmptyRosterSpots()}`);

    if (this.team.getPendingEmptyRosterSpots() <= 0) {
      const success = this.openOneRosterSpot(player);
      if (!success) {
        return false;
      }
    }
    this.movePlayerToPosition(player, "BN");
    return true;
  }

  /**
   * Find a list of third players, playerC, who is eligible to facilitate a
   * three-way swap between playerA and playerB. Return undefined if none found
   *
   * This finds a left-hand rotation swap, i.e. player A ->B -> C
   *
   * @private
   * @param {Player} playerA - player to be swapped out
   * @param {Player} playerB - player to be swapped in
   * @param {Player[]} eligiblePlayerCs - array of players to search for playerC
   * @return {(Player[] | undefined)} playerC or undefined if not found
   */
  private getPotentialPlayerCList(
    playerA: Player,
    playerB: Player,
    eligiblePlayerCs: Player[],
  ): Player[] | undefined {
    this.logInfo(
      `Finding playerC for playerA: ${playerA.player_name} ${playerA.player_key} ${playerA.selected_position} ${playerA.start_score}, playerB: ${playerB.player_name} ${playerB.player_key} ${playerB.selected_position} ${playerB.start_score}`,
    );

    // If we are moving playerA from inactive to active roster, player B will
    // go to BN as an intermediary step. This ensures that playerA can swap
    // with anyone, not just players they share an exact position with.

    const playerBPosition =
      playerA.isInactiveList() && playerB.isActiveRoster() ? "BN" : playerB.selected_position;

    return eligiblePlayerCs.filter(
      (playerC: Player) =>
        playerB !== playerC &&
        playerA !== playerC &&
        isDefined(playerC.selected_position) &&
        isDefined(playerA.selected_position) &&
        isDefined(playerBPosition) &&
        playerB.eligible_positions.includes(playerC.selected_position) &&
        playerC.eligible_positions.includes(playerA.selected_position) &&
        playerA.eligible_positions.includes(playerBPosition) &&
        playerC.selected_position !== playerA.selected_position,
    );
  }

  private findPlayerCforIllegalPlayerA(
    playerA: Player,
    playerB: Player,
    eligiblePlayerCs: Player[],
  ) {
    return this.getPotentialPlayerCList(playerA, playerB, eligiblePlayerCs)?.[0];
  }

  private findPlayerCforOptimization(
    playerA: Player,
    playerB: Player,
    eligiblePlayerCs: Player[],
  ): Player | undefined {
    return this.getPotentialPlayerCList(playerA, playerB, eligiblePlayerCs)?.find(
      (playerC: Player) =>
        playerA.compareStartScore(playerC) > 0 &&
        (playerC.isReservePlayer() ? playerA.compareStartScore(playerB) > 0 : true),
    );
  }

  /**
   * A helper function that will do a high level check to see if the lineup is successfully optimized.
   * This function checks for major issues and may miss some of the smaller possible optimizations.
   *
   * @public
   * @return {boolean}
   */
  public isSuccessfullyOptimized(): boolean {
    let result = true;
    result = this.hasNoUnfilledRosterPositions() && result;
    result = this.hasNoOverfilledRosterPositions() && result;
    result = this.hasNoIllegallyMovedPlayers() && result;
    result = this.hasOptimalLineup() && result;
    return result;
  }

  private hasNoUnfilledRosterPositions(): boolean {
    const unfilledActiveRosterPositions = this.team.unfilledStartingPositions;
    const reservePlayersEligibleForUnfilledPositions = this.team.reservePlayers
      .filter(
        (player) =>
          player.isActiveRoster() &&
          player.eligible_positions.some((position) =>
            unfilledActiveRosterPositions.includes(position),
          ),
      )
      .map((player) => player.player_key);
    if (reservePlayersEligibleForUnfilledPositions.length > 0) {
      logger.error(
        `Suboptimal Lineup: unfilledRosterPositions for team ${this.team.team_key}: ${unfilledActiveRosterPositions}`,
        {
          eligiblePlayersForUnfilledPositions: reservePlayersEligibleForUnfilledPositions,
        },
        this.team,
        { deltaPlayerPositions: this.deltaPlayerPositions },
      );
      return false;
    }
    return true;
  }

  private hasNoOverfilledRosterPositions(): boolean {
    const overfilledPositions = this.team.overfilledPositions;
    if (overfilledPositions.length > 0) {
      logger.error(
        `Illegal Lineup: Too many players at positions: ${overfilledPositions} for team ${this.team.team_key}`,
        this.team,
        { deltaPlayerPositions: this.deltaPlayerPositions },
      );
      return false;
    }
    return true;
  }

  private isRosterLegal(): boolean {
    return this.team.illegalPlayers.length === 0 && this.hasNoOverfilledRosterPositions();
  }
  private hasNoIllegallyMovedPlayers(): boolean {
    const illegallyMovedPlayers = Object.keys(this.deltaPlayerPositions).filter((movedPlayerKey) =>
      this.team.illegalPlayers.some((illegalPlayer) => illegalPlayer.player_key === movedPlayerKey),
    );
    if (illegallyMovedPlayers.length > 0) {
      logger.error(
        `Illegal Lineup: illegalPlayers moved for team ${this.team.team_key}: ${illegallyMovedPlayers}`,
        this.team,
        { deltaPlayerPositions: this.deltaPlayerPositions },
      );
      return false;
    }
    return true;
  }
  private hasOptimalLineup(): boolean {
    const suboptimalBNPlayers = this.team.reservePlayers
      .filter((reservePlayer) =>
        this.team.startingPlayers.some((startingPlayer) =>
          reservePlayer.isEligibleAndHigherScoreThan(startingPlayer),
        ),
      )
      .map((player) => ({
        player_key: player.player_key,
        start_score: player.start_score,
      }));

    if (suboptimalBNPlayers.length > 0) {
      const suboptimalRosterPlayers = this.team.startingPlayers
        .filter((startingPlayer) =>
          this.team.reservePlayers.some((reservePlayer) =>
            reservePlayer.isEligibleAndHigherScoreThan(startingPlayer),
          ),
        )
        .map((player) => ({
          player_key: player.player_key,
          start_score: player.start_score,
        }));

      logger.error(
        `Suboptimal Lineup: reservePlayers have higher scores than startingPlayers for team ${this.team.team_key}`,
        { BNPlayers: suboptimalBNPlayers },
        { RosterPlayers: suboptimalRosterPlayers },
        this.team,
        { deltaPlayerPositions: this.deltaPlayerPositions },
      );
      return false;
    }
    return true;
  }
}
