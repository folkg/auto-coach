import type { Team } from "../../services/interfaces/team";

export type SetLineupEvent = {
  team: Team;
  isSettingLineups: boolean;
};

export type PauseLineupEvent = {
  team: Team;
};
