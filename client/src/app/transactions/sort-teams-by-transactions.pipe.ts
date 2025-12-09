import type { ClientTeam } from "@common/types/team";
import type { PlayerTransaction } from "@common/types/transactions";

import { Pipe, type PipeTransform } from "@angular/core";

@Pipe({
  name: "sortTeamsByTransactions",
  standalone: true,
})
export class SortTeamsByTransactionsPipe implements PipeTransform {
  transform(teams: ClientTeam[], allTransactions: PlayerTransaction[]): ClientTeam[] {
    return teams.sort((a, b) => {
      const aHasTransactions = allTransactions.filter((t) => t.teamKey === a.team_key).length > 0;
      const bHasTransactions = allTransactions.filter((t) => t.teamKey === b.team_key).length > 0;
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
