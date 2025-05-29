import type { Team } from "@common/types/team";

export type SetLineupEvent = {
  team: Team;
  isSettingLineups: boolean;
};

export type PauseLineupEvent = {
  team: Team;
};
