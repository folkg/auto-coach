import type { SportLeague } from "../../common/interfaces/SportLeague";

export type GameStartTimes = {
  [key in SportLeague]?: number[];
};
