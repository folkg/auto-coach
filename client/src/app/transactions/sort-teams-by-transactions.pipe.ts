import { Pipe, type PipeTransform } from "@angular/core";

import type { Team } from "../services/interfaces/team";
import type { PlayerTransaction } from "./interfaces/TransactionsData";

@Pipe({
  name: "sortTeamsByTransactions",
  standalone: true,
})
export class SortTeamsByTransactionsPipe implements PipeTransform {
  transform(teams: Team[], allTransactions: PlayerTransaction[]): Team[] {
    return teams.sort((a, b) => {
      const aHasTransactions =
        allTransactions.filter((t) => t.teamKey === a.team_key).length > 0;
      const bHasTransactions =
        allTransactions.filter((t) => t.teamKey === b.team_key).length > 0;
      if (aHasTransactions && !bHasTransactions) {
        return -1;
      }
      if (!aHasTransactions && bHasTransactions) {
        return 1;
      }
      return 0;
    });
  }
}
