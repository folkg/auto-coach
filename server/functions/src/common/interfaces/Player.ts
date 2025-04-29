import { type } from "arktype";

export const PlayerRanks = type({
  last30Days: "number",
  last14Days: "number",
  next7Days: "number",
  restOfSeason: "number",
  last4Weeks: "number",
  projectedWeek: "number",
  next4Weeks: "number",
});

const PlayerOwnershipType = type("'waivers'|'freeagents'");

export const PlayerOwnership = type({
  ownership_type: PlayerOwnershipType,
  "waiver_date?": "string",
});

export const PlayerSchema = type({
  player_key: "string",
  player_name: "string",
  eligible_positions: "string[]",
  display_positions: "string[]",
  selected_position: "string | null",
  is_editable: "boolean",
  is_playing: "boolean",
  injury_status: "string",
  percent_started: "number",
  percent_owned: "number",
  percent_owned_delta: "number",
  is_starting: "string|number",
  is_undroppable: "boolean",
  ranks: PlayerRanks,
  ownership: PlayerOwnership.or("null"),
  "start_score?": "number",
  "ownership_score?": "number",
});

export type IPlayer = typeof PlayerSchema.infer;
export type PlayerRanks = typeof PlayerRanks.infer;
export type PlayerOwnership = typeof PlayerOwnership.infer;
