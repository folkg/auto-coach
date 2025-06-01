import type { Leagues } from "@common/types/Leagues";

export type GameStartTimes = {
  [key in Leagues]: number[];
};
