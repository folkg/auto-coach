import { type } from "arktype";
import { assertDefined, isDefined } from "../../helpers/checks.js";
import type { IPlayer, PlayerRanks } from "../../interfaces/Player.js";
import { flattenArray, parseToInt } from "../utilities.service.js";
import type { YahooAPIPlayers } from "./interfaces/YahooAPIResponse.js";

const FlatBasePlayerSchema = type({
  player_key: "string",
  name: { full: "string" },
  eligible_positions: type({ position: "string" }).array(),
  display_position: "string",
  is_undroppable: "string | number",
  editorial_team_key: "string",
  "status_full?": "string",
});

const FlatExtendedPlayerSchema = type({
  selected_position: "Record<string, unknown>[]",
  is_editable: "number",
  percent_started: "Record<string, unknown>[]",
  percent_owned: "Record<string, unknown>[]",
  starting_status: "Record<string, unknown>[]",
  ownership: type({
    ownership_type: "'waivers' | 'freeagents'",
    "waiver_date?": "string.date", // format: "YYYY-MM-DD"
  })
    .or("never[]")
    .pipe((item) => (Array.isArray(item) ? undefined : item)),
  opponent: "string | null",
  player_ranks: type({
    player_rank: {
      rank_type: "string",
      rank_value: "string",
    },
  }).array(),
}).partial();

const SelectedPositionSchema = type({
  position: "string",
});

const StartingStatusSchema = type({
  is_starting: "number | string",
});

const FlatPercentStartedSchema = type({
  "value?": "number",
  "delta?": "number | string",
  percent_started_cut_types: type({
    percent_started_cut_type: "Record<string, unknown>[]",
  }).array(),
});

type FlatPercentStarted = typeof FlatPercentStartedSchema.infer;

const FlatPercentOwnedSchema = type({
  "value?": "number",
  "delta?": "number | string",
  percent_owned_cut_types: type({
    percent_owned_cut_type: "Record<string, unknown>[]",
  }).array(),
});

type FlatPercentOwned = typeof FlatPercentOwnedSchema.infer;

/**
 * Deconstruct the players JSON object to get the required properties
 *
 * @param {*} playersJSON - The players JSON object
 * @param {Set<string>} [postponedTeams=new Set()] - A set of teams with postponed games today
 * @return {IPlayer[]} - An array of Player objects
 */
export default function buildPlayers(
  playersJSON: YahooAPIPlayers,
  postponedTeams: Set<string> = new Set(),
): IPlayer[] {
  const result: IPlayer[] = [];

  const players = playersJSON.players;
  for (const index in players) {
    const player = players[index];
    if (typeof player === "number") {
      continue;
    }

    const [basePlayer, ...extendedPlayer] = player.player;

    const flatBasePlayer = FlatBasePlayerSchema.assert(
      flattenArray(basePlayer),
    );
    const flatExtendedPlayer = FlatExtendedPlayerSchema.assert(
      flattenArray(extendedPlayer),
    );

    const selectedPosition = flatExtendedPlayer.selected_position
      ? SelectedPositionSchema.assert(
          flattenArray(flatExtendedPlayer.selected_position),
        ).position
      : null;

    const percentStartedData = flatExtendedPlayer.percent_started
      ? FlatPercentStartedSchema.assert(
          flattenArray(flatExtendedPlayer.percent_started),
        )
      : undefined;

    const percentOwnedData = flatExtendedPlayer.percent_owned
      ? FlatPercentOwnedSchema.assert(
          flattenArray(flatExtendedPlayer.percent_owned),
        )
      : undefined;

    assertDefined(flatExtendedPlayer.player_ranks);
    const ranks = getPlayerRanks(flatExtendedPlayer.player_ranks);

    const isStarting = flatExtendedPlayer.starting_status
      ? StartingStatusSchema.assert(
          flattenArray(flatExtendedPlayer.starting_status),
        ).is_starting
      : "N/A";

    const isPlaying =
      isDefined(flatExtendedPlayer.opponent) &&
      flatExtendedPlayer.opponent !== "Bye" &&
      !postponedTeams.has(flatBasePlayer.editorial_team_key);

    const playerObject: IPlayer = {
      player_key: flatBasePlayer.player_key,
      player_name: flatBasePlayer.name.full,
      eligible_positions: flatBasePlayer.eligible_positions.map(
        (pos) => pos.position,
      ),
      display_positions: flatBasePlayer.display_position.split(","),
      selected_position: selectedPosition,
      is_editable: flatExtendedPlayer.is_editable === 1,
      is_playing: isPlaying,
      injury_status: flatBasePlayer.status_full ?? "Healthy",
      percent_started: percentStartedData
        ? getPercentValueForCut(percentStartedData)
        : -22200, // Is this the right default?
      percent_owned: percentOwnedData
        ? getPercentValueForCut(percentOwnedData)
        : -22200,
      percent_owned_delta: parseToInt(percentOwnedData?.delta),
      is_starting: isStarting,
      ranks,
      is_undroppable: parseToInt(flatBasePlayer.is_undroppable) === 1,
      ownership: flatExtendedPlayer.ownership ?? null,
    };

    result.push(playerObject);
  }

  return result;
}

const FlatCutTypeSchema = type({
  cut_type: "string",
  "value?": "number",
});

function getPercentValueForCut(
  percentData: FlatPercentStarted | FlatPercentOwned,
  cut = "diamond",
): number {
  let result = percentData.value;

  let percentCuts: Record<string, unknown>[];
  let percentType: string;
  if ("percent_started_cut_types" in percentData) {
    percentCuts = percentData.percent_started_cut_types;
    percentType = "percent_started";
  } else {
    percentCuts = percentData.percent_owned_cut_types;
    percentType = "percent_owned";
  }

  for (const cutType of percentCuts) {
    const cutTypeObject = FlatCutTypeSchema.assert(
      flattenArray(
        type("Record<string, unknown>[]").assert(
          cutType[`${percentType}_cut_type`],
        ),
      ),
    );
    if (cutTypeObject.cut_type === cut) {
      result = cutTypeObject.value;
      break;
    }
  }

  return result ?? 0;
}

function getPlayerRanks(
  playerRanksData: { player_rank: { rank_type: string; rank_value: string } }[],
): PlayerRanks {
  const rankTypeMap: { [key: string]: keyof PlayerRanks } = {
    L30: "last30Days",
    L14: "last14Days",
    PS7: "next7Days",
    PSR: "restOfSeason",
    L4W: "last4Weeks",
    PW: "projectedWeek",
    PN4W: "next4Weeks",
  };
  const result: PlayerRanks = {
    last30Days: -1,
    last14Days: -1,
    next7Days: -1,
    restOfSeason: -1,
    last4Weeks: -1,
    projectedWeek: -1,
    next4Weeks: -1,
  };

  for (const { player_rank } of playerRanksData) {
    const rankType = player_rank.rank_type;

    if (rankType in rankTypeMap) {
      const key = rankTypeMap[rankType];
      if (player_rank.rank_value !== "-") {
        result[key] = parseToInt(player_rank.rank_value);
      }
    }
  }

  return result;
}
