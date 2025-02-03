import { Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
// biome-ignore lint/style/useImportType: This is a bug with the plugin, this is an injection token
import { MatDialog } from "@angular/material/dialog";
import { FirebaseError } from "@firebase/app";
import {
  type Functions,
  getFunctions,
  httpsCallableFromURL,
} from "@firebase/functions";
import {
  BehaviorSubject,
  type Observable,
  Subject,
  catchError,
  concat,
  from,
  lastValueFrom,
  map,
  of,
  startWith,
  switchMap,
} from "rxjs";
// biome-ignore lint/style/useImportType: This is a bug with the plugin, this is an injection token
import { AuthService } from "src/app/services/auth.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "src/app/shared/confirm-dialog/confirm-dialog.component";

import { assertType, isType } from "../shared/utils/checks";
import { getErrorMessage } from "../shared/utils/error";
import { shareLatest } from "../shared/utils/shareLatest";
// biome-ignore lint/style/useImportType: This is a bug with the plugin, this is an injection token
import { FirestoreService } from "../teams/services/firestore.service";
import { Team, type TeamFirestore } from "./interfaces/team";

@Injectable({
  providedIn: "root",
})
export class SyncTeamsService {
  private readonly refetch$ = new Subject<void>();
  private readonly teamsSubject = new BehaviorSubject<Team[]>([]);

  readonly teams$ = this.teamsSubject.asObservable();
  readonly loading$: Observable<boolean>;

  private readonly functions: Functions;

  constructor(
    private readonly auth: AuthService,
    private readonly firestoreService: FirestoreService,
    readonly dialog: MatDialog,
  ) {
    this.functions = getFunctions();

    const teamsStream$ = this.refetch$.pipe(
      startWith(undefined),
      switchMap(() => {
        const sessionStorageTeams = this.loadSessionStorageTeams();
        const hasValidSessionStorageTeams =
          isType(sessionStorageTeams, Team.array()) &&
          sessionStorageTeams.length > 0;

        if (hasValidSessionStorageTeams) {
          return concat(
            of({ loading: true, teams: sessionStorageTeams }),
            from(
              this.patchTeamPropertiesFromFirestore(sessionStorageTeams),
            ).pipe(map((teams) => ({ loading: false, teams }))),
          );
        }

        const localStorageTeams = this.loadLocalStorageTeams();
        const hasValidLocalStorageTeams = isType(
          localStorageTeams,
          Team.array(),
        );

        if (hasValidLocalStorageTeams) {
          return concat(
            of({ loading: true, teams: localStorageTeams }),
            from(this.getFreshTeams()).pipe(
              map((teams) => ({ loading: false, teams })),
            ),
          );
        }

        return concat(
          of({ loading: true, teams: [] }),
          from(this.getFreshTeams()).pipe(
            map((teams) => ({ loading: false, teams })),
          ),
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

  optimisticallyUpdateTeam<K extends keyof Team>(
    teamKey: string,
    property: K,
    value: Team[K],
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

  private async getFreshTeams(): Promise<Team[]> {
    const fetchedTeams = await this.fetchTeamsFromYahoo();
    return this.patchTeamPropertiesFromFirestore(fetchedTeams);
  }

  private async fetchTeamsFromYahoo(): Promise<Team[]> {
    // fetch teams from yahoo via firebase function
    const fetchTeamsFromServer = httpsCallableFromURL<null, Team[]>(
      this.functions,
      "https://fantasyautocoach.com/api/fetchuserteams",
    );

    try {
      const teamsData = await fetchTeamsFromServer();
      const teams = teamsData.data;

      assertType(teams, Team.array());
      return teams;
    } catch (err) {
      if (err instanceof FirebaseError && err.code === "functions/data-loss") {
        // if the error is data-loss, it means the user's access token has expired
        throw new Error("Refresh Token Error");
      }

      throw new Error(
        `Error fetching teams from Yahoo: ${getErrorMessage(err)}`,
      );
    }
  }

  private async patchTeamPropertiesFromFirestore(
    teamsToPatch: Team[],
  ): Promise<Team[]> {
    const firestoreTeams = await this.fetchTeamsFromFirestore();

    for (const teamToPatch of teamsToPatch) {
      const firestoreTeam = firestoreTeams.find(
        (firestoreTeam) => firestoreTeam.team_key === teamToPatch.team_key,
      );
      Object.assign(teamToPatch, firestoreTeam);
    }

    return teamsToPatch;
  }

  private fetchTeamsFromFirestore(): Promise<TeamFirestore[]> {
    return this.firestoreService.fetchTeams();
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
      this.errorDialog(errorMessage, "ERROR Fetching Teams").catch(
        console.error,
      );
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
