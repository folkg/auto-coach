import type { ClientTeam } from "@common/types/team";

export type SetLineupEvent = {
  team: ClientTeam;
  isSettingLineups: boolean;
};

export type PauseLineupEvent = {
  team: ClientTeam;
};
