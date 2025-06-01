import type { IPlayer } from "@common/types/Player.js";
import type { TeamOptimizer } from "@common/types/team";
import { assertTrue } from "@common/utilities/checks.js";
import { type } from "arktype";
import {
  flattenArray,
  getPacificEndOfDay,
  getPacificStartOfDay,
  parseToInt,
} from "../utilities.service.js";
import { YahooAPIPlayersSchema } from "./interfaces/YahooAPIResponse.js";
import { getRostersByTeamID } from "./yahooAPI.service.js";
import buildPlayers from "./yahooPlayerProcessing.service.js";
import {
  createTransactionArray,
  FlatGameDetailsSchema,
  FlatTeamSchema,
  GamesPlayedSchema,
  getGamesPlayedArray,
  getInningsPitchedArray,
  getLeagueSettingsAnduserTeam,
  getPositionCounts,
  TeamTransactionSchema,
} from "./yahooTeamProcesssing.services.js";

const TeamRosterSchema = type({
  roster: {
    "0": YahooAPIPlayersSchema,
    is_editable: "number",
    coverage_type: "'date' | 'week'",
    "date?": "string.date",
    "week?": "string | number",
  },
});

const ExtendedTeamSchema = TeamRosterSchema.and(TeamTransactionSchema).and(
  GamesPlayedSchema,
);

/**
 * Get the roster objects for the given teams
 *
 * @export
 * @async
 * @param {string[]} teamKeys The team keys
 * @param {string} uid The firebase uid of the user
 * @param {string} [date=""] The date to get the roster for. If not provided, the default "" is today's date
 * @param {Set<string>} [postponedTeams] A set of teams with postponed games today
 * @return {Promise<TeamOptimizer[]>} The roster objects
 */
export async function fetchRostersFromYahoo(
  teamKeys: string[],
  uid: string,
  date = "",
  postponedTeams?: Set<string>,
): Promise<TeamOptimizer[]> {
  const result: TeamOptimizer[] = [];

  if (teamKeys.length === 0) {
    return result;
  }

  const yahooJSON = await getRostersByTeamID(teamKeys, uid, date);
  const gamesJSON = yahooJSON.fantasy_content.users[0].user[1].games;

  // Loop through each "game" (nfl, nhl, nba, mlb)
  for (const gameKey in gamesJSON) {
    if (gameKey === "count") {
      continue;
    }
    assertTrue(typeof gamesJSON[gameKey] !== "number");
    const gameJSON = gamesJSON[gameKey].game;
    const flatGameDetails = FlatGameDetailsSchema.assert(gameJSON[0]);
    const leaguesJSON = gameJSON[1].leagues;

    // Loop through each league within the game
    for (const leagueKey in leaguesJSON) {
      if (leagueKey === "count") {
        continue;
      }

      const { leagueDetails, leagueSettings, usersTeam } =
        getLeagueSettingsAnduserTeam(leaguesJSON, leagueKey);

      const [baseTeam, ...extendedTeam] = usersTeam;
      const flatTeam = FlatTeamSchema.assert(flattenArray(baseTeam));
      const flatExtendedTeam = ExtendedTeamSchema.assert(
        flattenArray(extendedTeam),
      );
      const usersTeamRoster = flatExtendedTeam.roster;

      const isEditable = usersTeamRoster.is_editable;
      if (!isEditable) {
        // skip this team if it is not editable
        continue;
      }

      const coverageType = usersTeamRoster.coverage_type;
      // save the position counts to a map
      const rosterPositions = getPositionCounts(
        leagueSettings.roster_positions,
      );
      const players: IPlayer[] = buildPlayers(
        usersTeamRoster[0],
        postponedTeams,
      );
      const gamesPlayedArray = getGamesPlayedArray(
        flatExtendedTeam.games_played,
      );
      const inningsPitchedArray = getInningsPitchedArray(
        flatExtendedTeam.games_played,
      );

      // TODO: Could add max/current adds condtionally as well
      const rosterObject: TeamOptimizer = {
        team_key: flatTeam.team_key,
        team_name: flatTeam.name,
        league_name: leagueDetails.name,
        players: players,
        coverage_type: coverageType,
        coverage_period: usersTeamRoster[coverageType]?.toString() ?? "",
        weekly_deadline: leagueDetails.weekly_deadline,
        edit_key: leagueDetails.edit_key,
        game_code: flatGameDetails.code,
        num_teams: leagueDetails.num_teams,
        roster_positions: rosterPositions,
        scoring_type: leagueDetails.scoring_type,
        current_weekly_adds: parseToInt(flatTeam.roster_adds.value, 0),
        current_season_adds: parseToInt(flatTeam.number_of_moves, 0),
        max_weekly_adds: parseToInt(leagueSettings.max_weekly_adds),
        max_season_adds: parseToInt(leagueSettings.max_adds),
        start_date: getPacificStartOfDay(leagueDetails.start_date),
        end_date: getPacificEndOfDay(leagueDetails.end_date),
        faab_balance: parseToInt(flatTeam.faab_balance),
        waiver_rule: leagueSettings.waiver_rule,
        transactions: createTransactionArray(flatExtendedTeam.transactions),
        ...(gamesPlayedArray && { games_played: gamesPlayedArray }),
        ...(inningsPitchedArray && { innings_pitched: inningsPitchedArray }),
      };

      result.push(rosterObject);
    }
  }

  return result;
}
