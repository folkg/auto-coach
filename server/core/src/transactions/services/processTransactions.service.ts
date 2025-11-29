import { logger } from "firebase-functions";
import assert from "node:assert";
import type { IPlayer } from "@common/types/Player.js";
import type { FirestoreTeam, TeamOptimizer } from "@common/types/team.js";
import type {
  LineupChanges,
  PlayerTransaction,
  TPlayer,
  TransactionType,
} from "@common/types/transactions.js";
import { getScarcityOffsetsForTeam } from "../../calcPositionalScarcity/services/positionalScarcity.service.js";
import { sendUserEmail } from "../../common/services/email/email.service.js";
import { getActiveTeamsForUser } from "../../common/services/firebase/firestore.service.js";
import { enrichTeamsWithFirestoreSettings } from "../../common/services/firebase/firestoreUtils.service.js";
import {
  getCurrentPacificNumDay,
  getPacificTimeDateString,
} from "../../common/services/utilities.service.js";
import {
  postRosterAddDropTransaction,
  putLineupChanges,
} from "../../common/services/yahooAPI/yahooAPI.service.js";
import { fetchRostersFromYahoo } from "../../common/services/yahooAPI/yahooLineupBuilder.service.js";
import {
  fetchTopAvailablePlayersFromYahoo,
  type TopAvailablePlayers,
} from "../../common/services/yahooAPI/yahooTopAvailablePlayersBuilder.service.js";
import { LineupOptimizer } from "../../dispatchSetLineup/classes/LineupOptimizer.js";

type TransactionsData = {
  dropPlayerTransactions: PlayerTransaction[][] | null;
  lineupChanges: LineupChanges[] | null;
  addSwapTransactions: PlayerTransaction[][] | null;
  topAddCandidatesList?: AssignedPlayersList;
  topDropCandidatesList?: AssignedPlayersList;
  playersAtPositionList?: PlayetsAtPositionsList;
};
type TransactionResults = {
  postedTransactions: PlayerTransaction[];
  failedReasons: string[];
};
type PostTransactionsResult = {
  success: boolean;
  transactionResults: TransactionResults;
};
type PlayetsAtPositionsList = {
  [teamKey: string]: {
    [position: string]: number;
  };
};
type AssignedPlayersList = {
  [teamKey: string]: IPlayer[];
};

/**
 * Will optimize the starting lineup for a specific users teams
 *
 * @export
 * @async
 * @param {(string)} uid - The user id
 * @param {(any[])} firestoreTeams - The team objects from Firestore
 * @return {unknown}
 */
export async function getTransactions(uid: string): Promise<TransactionsData> {
  assert(uid, "No uid provided");

  const teams = await getActiveTeamsForUser(uid);

  if (teams.size === 0) {
    logger.log(`No active teams for user ${uid}`);
    return {
      dropPlayerTransactions: null,
      lineupChanges: null,
      addSwapTransactions: null,
      topAddCandidatesList: {},
      topDropCandidatesList: {},
      playersAtPositionList: {},
    };
  }

  const firestoreTeams: FirestoreTeam[] = teams.docs.map((doc) => {
    const team = doc.data();
    team.team_key = doc.id;
    return team as FirestoreTeam;
  });

  const intradayTeams = firestoreTeams.filter(
    (team) => team.weekly_deadline === "intraday" || team.game_code === "nfl",
  );
  const nextDayTeams = firestoreTeams.filter(
    (team) =>
      (team.weekly_deadline === "" ||
        team.weekly_deadline === (getCurrentPacificNumDay() + 1).toString()) &&
      team.game_code !== "nfl",
  );

  const topAvailablePlayerCandidates: TopAvailablePlayers = await getTopAvailablePlayers(
    firestoreTeams,
    uid,
  );

  const [todays, tomorrows] = await Promise.all([
    getPlayerTransactionsForDate(uid, intradayTeams, topAvailablePlayerCandidates),
    getPlayerTransactionsForDate(
      uid,
      nextDayTeams,
      topAvailablePlayerCandidates,
      tomorrowsDateAsString(),
    ),
  ]);

  const dropPlayerTransactions = (todays.dropPlayerTransactions ?? []).concat(
    tomorrows.dropPlayerTransactions ?? [],
  );

  const lineupChanges = (todays.lineupChanges ?? []).concat(tomorrows.lineupChanges ?? []);

  const addSwapTransactions = (todays.addSwapTransactions ?? []).concat(
    tomorrows.addSwapTransactions ?? [],
  );

  const topAddCandidatesList = {
    ...todays.topAddCandidatesList,
    ...tomorrows.topAddCandidatesList,
  };
  const topDropCandidatesList = {
    ...todays.topDropCandidatesList,
    ...tomorrows.topDropCandidatesList,
  };
  const playersAtPositionList = {
    ...todays.playersAtPositionList,
    ...tomorrows.playersAtPositionList,
  };

  return {
    dropPlayerTransactions,
    lineupChanges,
    addSwapTransactions,
    topAddCandidatesList,
    topDropCandidatesList,
    playersAtPositionList,
  };
}

export async function postTransactions(
  transactionData: TransactionsData,
  uid: string,
): Promise<PostTransactionsResult> {
  let success = false;
  let allPostedTransactions: PlayerTransaction[] = [];
  let allFailedReasons: string[] = [];

  const { dropPlayerTransactions, lineupChanges, addSwapTransactions } = transactionData;

  if (dropPlayerTransactions) {
    // any dropped players need to be processed before healthy players on IL are moved to BN with lineupChanges
    const { postedTransactions, failedReasons } =
      await postSomeTransactions(dropPlayerTransactions);

    success = true;
    allPostedTransactions = postedTransactions;
    allFailedReasons = failedReasons;
  }

  if (lineupChanges) {
    // any injured players on roster need to be moved to IL before add player transactions are processed with addSwapTransactions
    await putAllLineupChanges(lineupChanges);

    success = true;
  }

  if (addSwapTransactions) {
    const { postedTransactions, failedReasons } = await postSomeTransactions(addSwapTransactions);

    allPostedTransactions = allPostedTransactions.concat(postedTransactions);
    allFailedReasons = allFailedReasons.concat(failedReasons);
    success = true;
  }

  if (allPostedTransactions.length > 0) {
    sendSuccessfulTransactionEmail(allPostedTransactions, uid);
  }

  return {
    success,
    transactionResults: {
      postedTransactions: allPostedTransactions,
      failedReasons: allFailedReasons,
    },
  };

  async function postSomeTransactions(
    transactions: PlayerTransaction[][],
  ): Promise<TransactionResults> {
    try {
      return await postTransactionsHelper(transactions, uid);
    } catch (error) {
      logger.error("Error in postSomeTransactions()", error);
      logger.error("Transactions object: ", { transactions });
      throw error;
    }
  }

  async function putAllLineupChanges(lineupChanges: LineupChanges[]) {
    try {
      await putLineupChanges(lineupChanges, uid);
    } catch (error) {
      logger.error("Error in putAllLineupChanges()", error);
      logger.error("Lineup changes object: ", { lineupChanges });
      throw error;
    }
  }
}

async function getPlayerTransactionsForDate(
  uid: string,
  firestoreTeams: readonly FirestoreTeam[],
  topAvailablePlayerCandidates: TopAvailablePlayers,
  date?: string,
): Promise<TransactionsData> {
  assert(uid, "No uid provided");
  assert(firestoreTeams, "No teams provided");

  const teamKeys: string[] = firestoreTeams.map((t) => t.team_key);
  let usersTeams = await fetchRostersFromYahoo(teamKeys, uid, date);
  if (usersTeams.length === 0) {
    return {
      dropPlayerTransactions: null,
      lineupChanges: null,
      addSwapTransactions: null,
    };
  }

  usersTeams = enrichTeamsWithFirestoreSettings(usersTeams, firestoreTeams);

  return await createPlayersTransactions(usersTeams, topAvailablePlayerCandidates);
}

export async function getTopAvailablePlayers(
  firestoreTeams: readonly FirestoreTeam[],
  uid: string,
) {
  // TODO: Do we want to initiate the promises here, or earlier in the call stack before we know usersTeams.length > 0?
  // Pro: We can get the top available players while we wait for the usersTeamsPromise to resolve
  // Con: We are initiating a bunch of promises that we may not need, using up API calls

  // TODO: Check pace before fetching add candidates? Could check each team inside the following function

  const promises = generateTopAvailablePlayerPromises(firestoreTeams, uid);
  const topAvailablePlayersPromise = promises[0];
  const nflTopAvailablePlayersPromise = promises[1];
  const restTopAvailablePlayersPromise = promises[2];

  if (
    !(topAvailablePlayersPromise && nflTopAvailablePlayersPromise && restTopAvailablePlayersPromise)
  ) {
    return {};
  }

  const topAvailablePlayerCandidates: TopAvailablePlayers = await mergeTopAvailabePlayers(
    topAvailablePlayersPromise,
    nflTopAvailablePlayersPromise,
    restTopAvailablePlayersPromise,
  );
  return topAvailablePlayerCandidates;
}

export async function createPlayersTransactions(
  teams: TeamOptimizer[],
  allAddCandidates: TopAvailablePlayers,
): Promise<TransactionsData> {
  const dropPlayerTransactions: PlayerTransaction[][] = [];
  const addSwapPlayerTransactions: PlayerTransaction[][] = [];
  const allLineupChanges: LineupChanges[] = [];
  const topAddCandidatesList: AssignedPlayersList = {};
  const topDropCandidatesList: AssignedPlayersList = {};
  const playersAtPositionList: PlayetsAtPositionsList = {};

  for (const team of teams) {
    const positionalScarcityOffsets = await getScarcityOffsetsForTeam(team);
    const lo = new LineupOptimizer(team, positionalScarcityOffsets);

    let dpt: PlayerTransaction[] | null;
    if (team.allow_dropping) {
      lo.generateDropPlayerTransactions();

      dpt = lo.playerTransactions;
      if (dpt) {
        dropPlayerTransactions.push(dpt);
        // TODO: Remove this, temporary logging to spot check the new positional scarcity offset functionality
        logger.log(
          `positionalScarcityOffsets for team ${
            team.team_key
          }: ${JSON.stringify(positionalScarcityOffsets)}`,
        );
        logger.log(`dropPlayerTransactions: ${JSON.stringify(dpt)}`);
      }
    }

    const addCandidates = allAddCandidates[team.team_key] ?? [];

    if (addCandidates?.length > 0) {
      lo.addCandidates = addCandidates;

      if (team.allow_adding) {
        lo.generateAddPlayerTransactions();
      }
      if (team.allow_add_drops) {
        lo.generateSwapPlayerTransactions();
      }

      // filter out any add transactions that are already in drop transactions by comparing the reason field
      const aspt: PlayerTransaction[] | undefined = lo.playerTransactions?.filter(
        (pt) => !dpt?.some((dpt) => dpt.description === pt.description),
      );
      if (aspt) {
        addSwapPlayerTransactions.push(aspt);
        // TODO: Remove this, temporary logging to spot check the new positional scarcity offset functionality
        logger.log(
          `positionalScarcityOffsets for team ${
            team.team_key
          }: ${JSON.stringify(positionalScarcityOffsets)}`,
        );
        logger.log(`addSwapPlayerTransactions: ${JSON.stringify(aspt)}`);
      }
    }

    const lc: LineupChanges | null = lo.lineupChanges;
    if (lc) {
      allLineupChanges.push(lc);
    }

    // Add the already added and already dropped players to the top candidates list
    const { baseDropCandidates, baseAddCandidates } = lo.getBaseAddDropCandidates();

    topAddCandidatesList[team.team_key] = [
      ...baseAddCandidates,
      ...getPlayersFromTransactions("add", addSwapPlayerTransactions),
    ];
    topDropCandidatesList[team.team_key] = [
      ...baseDropCandidates,
      ...getPlayersFromTransactions("drop", dropPlayerTransactions),
      ...getPlayersFromTransactions("drop", addSwapPlayerTransactions),
    ];

    playersAtPositionList[team.team_key] = lo.teamObject.positionCounts;
  }

  return {
    dropPlayerTransactions: dropPlayerTransactions.length > 0 ? dropPlayerTransactions : null,
    lineupChanges: allLineupChanges.length > 0 ? allLineupChanges : null,
    addSwapTransactions: addSwapPlayerTransactions.length > 0 ? addSwapPlayerTransactions : null,
    topAddCandidatesList,
    topDropCandidatesList,
    playersAtPositionList,
  };
}

function getPlayersFromTransactions(
  transactionType: TransactionType,
  playerTransactions: PlayerTransaction[][],
): IPlayer[] {
  return playerTransactions.flatMap((transactions) =>
    transactions.flatMap((transaction) =>
      transaction.players
        .filter((player: TPlayer) => player.transactionType === transactionType)
        .map((player: TPlayer) => player.player),
    ),
  );
}

async function postTransactionsHelper(
  playerTransactions: PlayerTransaction[][],
  uid: string,
): Promise<TransactionResults> {
  const postedTransactions: PlayerTransaction[] = [];
  const failedReasons: string[] = [];

  const allTransactionsPromises = playerTransactions
    .flat()
    .map((transaction) => postRosterAddDropTransaction(transaction, uid));

  const results = await Promise.allSettled(allTransactionsPromises);

  let error = false;
  for (const result of results) {
    if (result.status === "fulfilled") {
      const transaction = result.value;
      transaction && postedTransactions.push(transaction);
    } else if (result.status === "rejected") {
      error = true;
      const { reason } = result;
      logger.error(`Error in postAllTransactions() for User: ${uid}: ${JSON.stringify(reason)}`);
      failedReasons.push(reason);
    }
  }

  if (error) {
    throw new Error("Error in postAllTransactions()");
  }

  return { postedTransactions, failedReasons };
}

export function sendSuccessfulTransactionEmail(
  transactionsPosted: PlayerTransaction[],
  uid: string,
) {
  const body = ["The following transactions were processed:"].concat(
    stringifyTransactions(transactionsPosted),
  );
  sendUserEmail(uid, "Transactions were Automatically Processed for your Teams", body).catch(
    console.error,
  );
}

export function sendPotentialTransactionEmail(
  transactionsProposed: PlayerTransaction[],
  uid: string,
) {
  const body = ["The following transactions have been proposed for your teams:"].concat(
    stringifyTransactions(transactionsProposed),
  );
  sendUserEmail(
    uid,
    "New Transactions Available for your Teams",
    body,
    "Go to Transactions",
    "https://fantasyautocoach.com/transactions",
  ).catch(console.error);
}

function stringifyTransactions(transactions: PlayerTransaction[]): string[] {
  const result: string[] = [];

  const groupedTransactions = groupTransactionsByTeam(transactions);

  for (const teamKey of Object.keys(groupedTransactions)) {
    const teamTransactions = groupedTransactions[teamKey];
    if (!teamTransactions || teamTransactions.length === 0) {
      continue;
    }
    const firstTransaction = teamTransactions[0];
    if (!firstTransaction) {
      continue;
    }
    result.push(`<strong>${firstTransaction.teamName} (${firstTransaction.leagueName}):</strong>`);
    for (const transaction of teamTransactions) {
      result.push(transaction.description);
    }
  }

  return result;
}

function groupTransactionsByTeam(transactions: PlayerTransaction[]) {
  const result: { [key: string]: PlayerTransaction[] } = {};

  for (const transaction of transactions) {
    const existingTransactions = result[transaction.teamKey];
    if (existingTransactions) {
      existingTransactions.push(transaction);
    } else {
      result[transaction.teamKey] = [transaction];
    }
  }

  return result;
}

function tomorrowsDateAsString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getPacificTimeDateString(tomorrow);
}

export function generateTopAvailablePlayerPromises(
  firestoreTeams: readonly FirestoreTeam[],
  uid: string,
) {
  const nflTeamKeysAddingPlayers: string[] = firestoreTeams
    .filter((team) => (team.allow_adding || team.allow_add_drops) && team.game_code === "nfl")
    .map((team) => team.team_key);
  const restTeamKeysAddingPlayers: string[] = firestoreTeams
    .filter((team) => (team.allow_adding || team.allow_add_drops) && team.game_code !== "nfl")
    .map((team) => team.team_key);
  const allTeamKeysAddingPlayers: string[] =
    nflTeamKeysAddingPlayers.concat(restTeamKeysAddingPlayers);

  if (allTeamKeysAddingPlayers.length === 0) {
    return [Promise.resolve({}), Promise.resolve({}), Promise.resolve({})];
  }

  const topAvailablePlayersPromise: Promise<TopAvailablePlayers> =
    fetchTopAvailablePlayersFromYahoo(allTeamKeysAddingPlayers, uid, "A", "sort=R_PO");

  let nflTopAvailablePlayersPromise: Promise<TopAvailablePlayers>;
  if (nflTeamKeysAddingPlayers.length > 0) {
    nflTopAvailablePlayersPromise = fetchTopAvailablePlayersFromYahoo(
      nflTeamKeysAddingPlayers,
      uid,
      "A",
      "sort=AR_L4W;sort_type=last4weeks",
    );
  } else {
    nflTopAvailablePlayersPromise = Promise.resolve({});
  }

  let restTopAvailablePlayersPromise: Promise<TopAvailablePlayers>;
  if (restTeamKeysAddingPlayers.length > 0) {
    restTopAvailablePlayersPromise = fetchTopAvailablePlayersFromYahoo(
      restTeamKeysAddingPlayers,
      uid,
      "A",
      "sort=AR_L14;sort_type=biweekly",
    );
  } else {
    restTopAvailablePlayersPromise = Promise.resolve({});
  }

  return [
    topAvailablePlayersPromise,
    nflTopAvailablePlayersPromise,
    restTopAvailablePlayersPromise,
  ];
}

export async function mergeTopAvailabePlayers(
  topAvailablePlayersPromise: Promise<TopAvailablePlayers>,
  nflTopAvailablePlayersPromise: Promise<TopAvailablePlayers>,
  restTopAvailablePlayersPromise: Promise<TopAvailablePlayers>,
): Promise<TopAvailablePlayers> {
  const result: TopAvailablePlayers = {};

  const resolvedPlayers = await Promise.all([
    topAvailablePlayersPromise,
    nflTopAvailablePlayersPromise,
    restTopAvailablePlayersPromise,
  ]);

  for (const resolvedPromise of resolvedPlayers) {
    for (const teamKey in resolvedPromise) {
      const existingTeamPlayers = result[teamKey];
      const newTeamPlayers = resolvedPromise[teamKey];
      if (Array.isArray(existingTeamPlayers) && newTeamPlayers) {
        existingTeamPlayers.push(...newTeamPlayers);
      } else if (newTeamPlayers) {
        result[teamKey] = newTeamPlayers;
      }
    }
  }

  return result;
}
