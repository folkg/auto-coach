import type { Leagues } from "@common/types/Leagues.js";

export type GameStartTimes = {
  [key in Leagues]: number[];
};
