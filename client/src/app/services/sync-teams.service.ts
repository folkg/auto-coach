import {
  BehaviorSubject,
  catchError,
  combineLatest,
  concat,
  filter,
  from,
  lastValueFrom,
  map,
  type Observable,
  of,
  Subject,
  startWith,
  switchMap,
} from "rxjs";
import { Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import { ClientTeam } from "@common/types/team";
import { isDefined, isType } from "@common/utilities/checks";
import { getErrorMessage } from "@common/utilities/error";
import { AuthService } from "../services/auth.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";
import { shareLatest } from "../shared/utils/shareLatest";
import { APIService } from "./api.service";

@Injectable({
  providedIn: "root",
})
export class SyncTeamsService {
  private readonly refetch$ = new Subject<void>();
  private readonly teamsSubject = new BehaviorSubject<ClientTeam[]>([]);

  readonly teams$ = this.teamsSubject.asObservable();
  readonly loading$: Observable<boolean>;

  constructor(
    private readonly api: APIService,
    private readonly auth: AuthService,
    readonly dialog: MatDialog,
  ) {
    const teamsStream$ = combineLatest([
      this.auth.user$,
      this.refetch$.pipe(startWith(undefined)),
    ]).pipe(
      filter(([user]) => isDefined(user)),
      switchMap(() => {
        const sessionStorageTeams = this.loadSessionStorageTeams();
        const hasValidSessionStorageTeams =
          isType(sessionStorageTeams, ClientTeam.array()) && sessionStorageTeams.length > 0;

        if (hasValidSessionStorageTeams) {
          return concat(
            of({ loading: true, teams: sessionStorageTeams }),
            from(this.patchTeamPropertiesFromFirestore(sessionStorageTeams)).pipe(
              map((teams) => ({ loading: false, teams })),
            ),
          );
        }

        const localStorageTeams = this.loadLocalStorageTeams();
        const hasValidLocalStorageTeams = isType(localStorageTeams, ClientTeam.array());

        if (hasValidLocalStorageTeams) {
          return concat(
            of({ loading: true, teams: localStorageTeams }),
            from(this.fetchTeams()).pipe(map((teams) => ({ loading: false, teams }))),
          );
        }

        return concat(
          of({ loading: true, teams: [] }),
          from(this.fetchTeams()).pipe(map((teams) => ({ loading: false, teams }))),
        );
      }),
      catchError((err) => {
        this.handleFetchTeamsError(err);
        return of({ loading: false, teams: [] });
      }),
      shareLatest(),
    );

    this.loading$ = teamsStream$.pipe(
      map((state) => state.loading),
      shareLatest(),
    );

    teamsStream$
      .pipe(
        takeUntilDestroyed(),
        map((state) => state.teams),
      )
      .subscribe(this.teamsSubject);

    this.teams$.pipe(takeUntilDestroyed()).subscribe((teams) => {
      if (teams.length > 0) {
        // localStorage will persist the teams across sessions
        // If we fetch a team once per session, it is assumed to be fresh for the duration of the session.
        sessionStorage.setItem("yahooTeams", JSON.stringify(teams));
        localStorage.setItem("yahooTeams", JSON.stringify(teams));
      }
    });
  }

  optimisticallyUpdateTeam<K extends keyof ClientTeam>(
    teamKey: string,
    property: K,
    value: ClientTeam[K],
  ): void {
    const currentTeams = this.teamsSubject.value;
    const updatedTeams = currentTeams.map((team) =>
      team.team_key === teamKey
        ? {
            ...team,
            [property]: value,
          }
        : team,
    );

    this.teamsSubject.next(updatedTeams);
  }

  refreshTeams(): void {
    this.refetch$.next();
  }

  private loadSessionStorageTeams(): unknown {
    return JSON.parse(sessionStorage.getItem("yahooTeams") ?? "[]");
  }

  private loadLocalStorageTeams(): unknown {
    return JSON.parse(localStorage.getItem("yahooTeams") ?? "[]");
  }

  fetchTeams(): Promise<ClientTeam[]> {
    try {
      return this.api.fetchTeamsYahoo();
    } catch (err) {
      // Check for specific error messages that might indicate token expiry
      const errorMsg = getErrorMessage(err);
      if (errorMsg.includes("token") || errorMsg.includes("auth")) {
        throw new Error("Refresh Token Error");
      }

      throw new Error(`Error fetching teams from Yahoo: ${errorMsg}`);
    }
  }

  private async patchTeamPropertiesFromFirestore(
    teamsToPatch: ClientTeam[],
  ): Promise<ClientTeam[]> {
    const partialTeams = await this.api.fetchTeamsPartial();

    return teamsToPatch.map((teamToPatch) => {
      const completeTeam = partialTeams.find((team) => team.team_key === teamToPatch.team_key);
      return completeTeam ? { ...teamToPatch, ...completeTeam } : teamToPatch;
    });
  }

  private handleFetchTeamsError(err: unknown): void {
    const errorMessage = getErrorMessage(err);
    if (errorMessage === "Refresh Token Error") {
      this.errorDialog(
        "Your teams are currently not being managed!\n" +
          "Please sign in again below to grant access for Fantasy AutoCoach to continue managing your teams.",
        "Yahoo Access Has Expired",
        "Sign in with Yahoo",
        "Cancel",
      )
        .then((result) => {
          if (result) {
            this.reauthenticateYahoo().catch(console.error);
          }
        })
        .catch(console.error);
    } else if (errorMessage) {
      this.errorDialog(errorMessage, "ERROR Fetching Teams").catch(console.error);
    } else {
      this.errorDialog(
        "Please ensure you are connected to the internet and try again",
        "ERROR Fetching Teams",
      ).catch(console.error);
    }
  }

  private async reauthenticateYahoo(): Promise<void> {
    await this.auth.reauthenticateYahoo();
  }

  private errorDialog(
    message: string,
    title = "ERROR",
    trueButton = "OK",
    falseButton: string | null = null,
  ): Promise<boolean> {
    const dialogData: DialogData = {
      title,
      message,
      trueButton: trueButton,
    };
    if (falseButton !== null) {
      dialogData.falseButton = falseButton;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      minWidth: "350px",
      width: "90%",
      maxWidth: "500px",
      data: dialogData,
    });

    return lastValueFrom(dialogRef.afterClosed());
  }
}
