import type { Player } from "../../common/classes/Player";

export interface PlayerTransaction {
  teamName: string;
  leagueName: string;
  teamKey: string;
  sameDayTransactions: boolean;
  description: string;
  reason: string | null;
  isFaabRequired?: boolean;
  players: TPlayer[];
}

export type TPlayer = {
  playerKey: string;
  transactionType: TransactionType;
  isInactiveList: boolean;
  player: Player;
  isFromWaivers?: boolean;
};

export type TransactionType = "add" | "drop" | "add/drop";
