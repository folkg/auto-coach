import type { InfoTeam } from "@common/types/team.js";

import { type } from "arktype";

import {
  flattenArray,
  getPacificEndOfDay,
  getPacificStartOfDay,
  parseToInt,
} from "../../common/services/utilities.service.js";
import { getUsersTeams } from "../../common/services/yahooAPI/yahooAPI.service.js";
import {
  FlatGameDetailsSchema,
  FlatTeamSchema,
  getLeagueSettingsAnduserTeam,
  getPositionCounts,
} from "../../common/services/yahooAPI/yahooTeamProcesssing.services.js";

const TeamStandingsSchema = type({
  team_standings: {
    rank: "string | number | null",
    "points_for?": "string | number",
    "points_against?": "string | number",
    "points_change?": "string | number",
    "points_back?": "string | number",
    "outcome_totals?": {
      wins: "string | number",
      losses: "string | number",
      ties: "string | number",
      percentage: "string | number",
    },
  },
});

export async function fetchTeamsYahoo(uid: string): Promise<InfoTeam[]> {
  const result: InfoTeam[] = [];

  const yahooJSON = await getUsersTeams(uid);
  const gamesJSON = yahooJSON.fantasy_content.users[0].user[1].games;

  // Loop through each "game" (nfl, nhl, nba, mlb)
  for (const gameKey in gamesJSON) {
    if (gameKey === "count") {
      continue;
    }

    const gameData = gamesJSON[gameKey];
    if (!gameData || typeof gameData === "number") {
      continue;
    }
    const gameJSON = gameData.game;

    const flatGameDetails = FlatGameDetailsSchema.assert(gameJSON[0]);
    const leagueData = gameJSON[1];
    if (!leagueData) {
      continue;
    }
    const leaguesJSON = leagueData.leagues;

    // Loop through each league within the game
    for (const leagueKey in leaguesJSON) {
      if (leagueKey === "count") {
        continue;
      }
      const { leagueDetails, leagueSettings, usersTeam } = getLeagueSettingsAnduserTeam(
        leaguesJSON,
        leagueKey,
      );

      const [baseTeam, ...extendedTeam] = usersTeam;
      const flatTeam = FlatTeamSchema.assert(flattenArray(baseTeam));

      const teamStandings = TeamStandingsSchema.assert(flattenArray(extendedTeam)).team_standings;
      const rosterPositions = getPositionCounts(leagueSettings.roster_positions);

      const teamObj: InfoTeam = {
        game_name: flatGameDetails.name,
        game_code: flatGameDetails.code,
        game_season: flatGameDetails.season,
        game_is_over: flatGameDetails.is_game_over === 1,
        team_key: flatTeam.team_key,
        team_name: flatTeam.name,
        team_url: flatTeam.url,
        team_logo: flatTeam.team_logos[0]?.team_logo.url ?? "",
        league_name: leagueDetails.name,
        num_teams: leagueDetails.num_teams,
        rank: teamStandings.rank,
        points_for: teamStandings.points_for,
        points_against: teamStandings.points_against,
        points_back: teamStandings.points_back,
        outcome_totals: teamStandings.outcome_totals,
        scoring_type: leagueDetails.scoring_type,
        start_date: getPacificStartOfDay(leagueDetails.start_date),
        end_date: getPacificEndOfDay(leagueDetails.end_date),
        weekly_deadline: leagueDetails.weekly_deadline,
        waiver_rule: leagueSettings.waiver_rule,
        faab_balance: parseToInt(flatTeam.faab_balance),
        current_weekly_adds: parseToInt(flatTeam.roster_adds.value, 0),
        current_season_adds: parseToInt(flatTeam.number_of_moves, 0),
        max_weekly_adds: parseToInt(leagueSettings.max_weekly_adds),
        max_season_adds: parseToInt(leagueSettings.max_adds),
        max_games_played: parseToInt(leagueSettings.max_games_played),
        max_innings_pitched: parseToInt(leagueSettings.max_innings_pitched),
        edit_key: leagueDetails.edit_key,
        roster_positions: rosterPositions,
      };

      result.push(teamObj);
    }
  }

  return result;
}
