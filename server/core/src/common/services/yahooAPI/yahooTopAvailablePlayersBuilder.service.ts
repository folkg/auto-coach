import type { IPlayer } from "@common/types/Player.js";
import { type } from "arktype";
import { YahooAPIPlayersSchema } from "./interfaces/YahooAPIResponse.js";
import {
  type AvailabilityStatus,
  getTopAvailablePlayers,
  type PlayerSort,
} from "./yahooAPI.service.js";
import buildPlayers from "./yahooPlayerProcessing.service.js";

export type TopAvailablePlayers = {
  [teamKey: string]: IPlayer[];
};

export const LeagueDetailsSchema = type({
  league_key: "string",
});

/**
 * Fetches the top available players from Yahoo API for a given league.
 *
 * @export
 * @async
 * @param {string} teamKeys - The league key
 * @param {string} uid - The user ID
 * @param {AvailabilityStatus} [availabilityStatus="A"] - The availability status of the players to fetch
 * @param {PlayerSort} [sort="sort=R_PO"] - The sort order of the players to fetch
 * @return {Promise<TopAvailablePlayers>} - A map of teamKeys' Top Available Players in an array
 */
export async function fetchTopAvailablePlayersFromYahoo(
  teamKeys: string[],
  uid: string,
  availabilityStatus: AvailabilityStatus = "A",
  sort: PlayerSort = "sort=R_PO",
): Promise<TopAvailablePlayers> {
  if (teamKeys.length === 0) {
    return {};
  }

  const result: TopAvailablePlayers = {};

  // create a map of leagueKeys to teamKeys
  const mapLeagueToTeam: { [key: string]: string } = {};
  for (const teamKey of teamKeys) {
    const leagueKey = teamKey.split(".t")[0];
    mapLeagueToTeam[leagueKey] = teamKey;
  }

  const yahooJSON = await getTopAvailablePlayers(
    teamKeys,
    uid,
    availabilityStatus,
    sort,
  );

  const gamesJSON = yahooJSON.fantasy_content.users[0].user[1].games;

  // Loop through each "game" (nfl, nhl, nba, mlb)
  for (const gameKey in gamesJSON) {
    if (gameKey === "count") {
      continue;
    }

    const gameJSON = gamesJSON[gameKey].game;
    const leaguesJSON = gameJSON[1].leagues;

    // Loop through each league within the game
    for (const index in leaguesJSON) {
      if (index === "count") {
        continue;
      }

      const league = leaguesJSON[index].league;
      const [baseLeague, ...extendedLeague] = league;

      const leagueDetails = LeagueDetailsSchema.assert(baseLeague);
      const leagueKey = leagueDetails.league_key;
      const teamKey = mapLeagueToTeam[leagueKey];

      const players = YahooAPIPlayersSchema.assert(extendedLeague[0]).players;

      result[teamKey] = buildPlayers({ players });
    }
  }
  // logger.log("Fetched rosters from Yahoo API:");
  // console.log(JSON.stringify(result));
  return result;
}
