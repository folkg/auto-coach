import { JsonPipe } from "@angular/common";
import { Component, computed, signal } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatButton } from "@angular/material/button";
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardTitle,
} from "@angular/material/card";
// biome-ignore lint/style/useImportType: This is an injection token
import { MatDialog } from "@angular/material/dialog";
import { lastValueFrom } from "rxjs";

// biome-ignore lint/style/useImportType: This is an injection token
import { ActivatedRoute, Router } from "@angular/router";
import { LoadingComponent } from "../loading/loading.component";
// biome-ignore lint/style/useImportType: This is an injection token
import { APIService } from "../services/api.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { SyncTeamsService } from "../services/sync-teams.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";
import { logError } from "../shared/utils/error";
import type {
  PlayerTransactionClient,
  TransactionResults,
  TransactionsData,
  TransactionsDataClient,
} from "./interfaces/TransactionsData";
import { SortTeamsByTransactionsPipe } from "./sort-teams-by-transactions.pipe";
import { TeamComponent } from "./team/team.component";

@Component({
  selector: "app-transactions",
  templateUrl: "./transactions.component.html",
  styleUrls: ["./transactions.component.scss"],
  imports: [
    TeamComponent,
    MatCard,
    MatCardHeader,
    MatCardTitle,
    MatCardContent,
    MatButton,
    JsonPipe,
    SortTeamsByTransactionsPipe,
    LoadingComponent,
  ],
})
export class TransactionsComponent {
  readonly allTeams = toSignal(this.sts.teams$, { initialValue: [] });
  readonly teams = computed(() =>
    this.allTeams().filter((team) => team.allow_transactions),
  );

  private readonly transactions = signal<TransactionsDataClient | undefined>(
    undefined,
  );
  readonly flatTransactions = computed<PlayerTransactionClient[] | undefined>(
    () => this.computeFlatTransactions(this.transactions()),
  );
  readonly selectedTransactions = computed(
    () => this.flatTransactions()?.filter((t) => t.selected) ?? [],
  );
  readonly numSelectedTransactions = computed(
    () => this.selectedTransactions().length,
  );

  readonly isProcessing = signal(false);
  readonly success = signal<boolean | undefined>(undefined);
  private readonly transactionResults = signal<TransactionResults | undefined>(
    undefined,
  );
  readonly successTransactions = computed(
    () => this.transactionResults()?.postedTransactions ?? [],
  );
  readonly failedReasons = computed(
    () => this.transactionResults()?.failedReasons ?? [],
  );

  constructor(
    private readonly api: APIService,
    private readonly sts: SyncTeamsService,
    private readonly dialog: MatDialog,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.fetchTransactions()
      .then((transactions) => this.transactions.set(transactions))
      .catch((err) =>
        logError(err, "Error fetching transactions from Firebase:"),
      );
  }

  private async fetchTransactions(): Promise<TransactionsDataClient> {
    const transactions = await this.api.fetchTransactions();
    return mapPlayerTransactions(
      transactions as TransactionsDataClient,
      (t) => ({
        ...t,
        selected: false,
        // TOOD: ID should be assigned on the server
        id: `${t.teamKey}-${t.players.map((p) => p.playerKey).join("-")}`,
      }),
    );
  }

  onSelectTransaction($event: { isSelected: boolean; transactionId: string }) {
    if (!this.transactions()) {
      return;
    }

    this.transactions.update((transactions) =>
      transactions
        ? mapPlayerTransactions(transactions, (t) =>
            t.id === $event.transactionId
              ? { ...t, selected: $event.isSelected }
              : t,
          )
        : undefined,
    );
  }

  private computeFlatTransactions(
    transactions: TransactionsDataClient | undefined,
  ): PlayerTransactionClient[] | undefined {
    if (!transactions) {
      return undefined;
    }

    const { dropPlayerTransactions, addSwapTransactions } = transactions;

    return (dropPlayerTransactions ?? [])
      .concat(addSwapTransactions ?? [])
      .flat();
  }

  private getSelectedTransactionsData(): TransactionsDataClient {
    const result: TransactionsDataClient = {
      dropPlayerTransactions: null,
      lineupChanges: null,
      addSwapTransactions: null,
    };

    const transactions = this.transactions();
    if (!transactions) {
      return result;
    }

    const { dropPlayerTransactions, lineupChanges, addSwapTransactions } =
      transactions;

    result.dropPlayerTransactions = filterSelectedTransactionsData(
      dropPlayerTransactions,
    );

    result.addSwapTransactions =
      filterSelectedTransactionsData(addSwapTransactions);

    // Keep all the lineup changes for the teams that have selected transactions, even if we don't need them all
    const teamsWithTransactions = new Set(
      this.selectedTransactions().map((t) => t.teamKey),
    );
    result.lineupChanges =
      lineupChanges?.filter((lc) => teamsWithTransactions.has(lc.teamKey)) ??
      null;

    return result;
  }

  async submitTransactions(): Promise<void> {
    const userSelectionConfirmed = await this.confirmDialog();
    if (userSelectionConfirmed) {
      this.isProcessing.set(true);
      try {
        const transactions = this.getSelectedTransactionsData();
        await this.postTransactions(transactions);
      } finally {
        this.isProcessing.set(false);
      }
    }
  }

  private async postTransactions(
    transactions: TransactionsData,
  ): Promise<void> {
    try {
      const result = await this.api.postTransactions(transactions);
      this.success.set(result.success);
      this.transactionResults.set(result.transactionResults);
    } catch (err) {
      logError(err, "Error posting transactions to Firebase:");
      this.success.set(false);
    }
  }

  confirmDialog(): Promise<boolean> {
    const numSelectedTransactions = this.numSelectedTransactions();

    const title = "WARNING: Permanent Action";
    const message = `These transactions will be permanent. Click Proceed to officially process your ${
      numSelectedTransactions !== 0 ? numSelectedTransactions : ""
    } selected transaction${
      numSelectedTransactions !== 1 ? "s" : ""
    } with Yahoo, or Cancel to return to the transactions page.`;
    const dialogData: DialogData = {
      title,
      message,
      trueButton: "Proceed",
      falseButton: "Cancel",
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      minWidth: "350px",
      width: "90%",
      maxWidth: "500px",
      data: dialogData,
    });
    return lastValueFrom(dialogRef.afterClosed());
  }

  reloadComponent(): void {
    this.router.navigateByUrl("/", { skipLocationChange: true }).then(() => {
      this.router.navigate([this.route.snapshot.routeConfig?.path ?? ""]);
    });
  }
}

function mapPlayerTransactions(
  transactionsData: TransactionsDataClient,
  mapFn: (t: PlayerTransactionClient) => PlayerTransactionClient,
): TransactionsDataClient {
  const { dropPlayerTransactions, addSwapTransactions, lineupChanges } =
    transactionsData;

  return {
    dropPlayerTransactions:
      dropPlayerTransactions?.map((tA) => tA.map((t) => mapFn(t))) ?? null,
    addSwapTransactions:
      addSwapTransactions?.map((tA) => tA.map((t) => mapFn(t))) ?? null,
    lineupChanges,
  };
}

function filterSelectedTransactionsData(
  playerTransactions: PlayerTransactionClient[][] | null,
): PlayerTransactionClient[][] | null {
  if (!playerTransactions) {
    return null;
  }

  return playerTransactions
    .map((teamTransactions) =>
      teamTransactions.filter((transaction) => transaction.selected),
    )
    .filter((selectedTransactions) => selectedTransactions.length > 0);
}
