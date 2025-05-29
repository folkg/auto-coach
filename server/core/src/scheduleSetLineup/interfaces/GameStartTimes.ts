import type { Leagues } from "../../../../../common/src/types/Leagues";

export type GameStartTimes = {
  [key in Leagues]: number[];
};
