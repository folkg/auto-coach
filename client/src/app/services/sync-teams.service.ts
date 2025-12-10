import type { Schedule } from "@common/types/Schedule";
import type { ClientTeam, FirestoreTeam } from "@common/types/team";

import { inject, Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import { ClientTeam as ClientTeamSchema } from "@common/types/team";
import { isDefined, isType } from "@common/utilities/checks";
import { getErrorMessage } from "@common/utilities/error";
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
  scan,
  startWith,
  Subject,
  switchMap,
} from "rxjs";

import { AuthService } from "../services/auth.service";
import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";
import { shareLatest } from "../shared/utils/shareLatest";
import { APIService } from "./api.service";

interface BaseTeamsState {
  readonly teams: readonly ClientTeam[];
  readonly schedule: Schedule | undefined;
}

interface LoadingInitialState extends BaseTeamsState {
  readonly status: "loading-initial";
}

interface LoadingTimesState extends BaseTeamsState {
  readonly status: "loading-times";
}

interface ReadyState extends BaseTeamsState {
  readonly status: "ready";
}

interface ErrorState extends BaseTeamsState {
  readonly status: "error";
  readonly error: string;
}

export type TeamsState = LoadingInitialState | LoadingTimesState | ReadyState | ErrorState;

const YAHOO_AUTH_REQUIRED_CODE = "YAHOO_AUTH_REQUIRED";

interface OptimisticUpdate {
  readonly teamKey: string;
  readonly updater: (team: ClientTeam) => ClientTeam;
}

@Injectable({
  providedIn: "root",
})
export class SyncTeamsService {
  private readonly api = inject(APIService);
  private readonly auth = inject(AuthService);
  readonly dialog = inject(MatDialog);

  private readonly refetch$ = new Subject<void>();
  private readonly optimisticUpdate$ = new Subject<OptimisticUpdate>();
  private readonly scheduleSubject = new BehaviorSubject<Schedule | undefined>(undefined);

  readonly schedule$ = this.scheduleSubject.asObservable();
  readonly teamsState$: Observable<TeamsState>;
  readonly teams$: Observable<readonly ClientTeam[]>;

  constructor() {
    const baseTeamsState$ = combineLatest([
      this.auth.user$,
      this.refetch$.pipe(startWith(undefined)),
    ]).pipe(
      filter(([user]) => isDefined(user)),
      switchMap(() => this.buildTeamsStream()),
      catchError((err) => {
        this.handleFetchTeamsError(err);
        return of({
          status: "error",
          teams: [],
          schedule: undefined,
          error: getErrorMessage(err),
        } as const);
      }),
      shareLatest(),
    );

    this.teamsState$ = baseTeamsState$.pipe(
      switchMap((baseState) =>
        this.optimisticUpdate$.pipe(
          scan(
            (state, update) => ({
              ...state,
              teams: state.teams.map((team) =>
                team.team_key === update.teamKey ? update.updater(team) : team,
              ),
            }),
            baseState,
          ),
          startWith(baseState),
        ),
      ),
      shareLatest(),
    );

    this.teams$ = this.teamsState$.pipe(map((state) => state.teams));

    this.teamsState$
      .pipe(
        takeUntilDestroyed(),
        map((state) => state.schedule),
        filter(isDefined),
      )
      .subscribe(this.scheduleSubject);

    this.teamsState$.pipe(takeUntilDestroyed()).subscribe(({ teams }) => {
      if (teams.length > 0) {
        // localStorage will persist the teams across sessions
        // If we fetch a team once per session, it is assumed to be fresh for the duration of the session.
        sessionStorage.setItem("yahooTeams", JSON.stringify(teams));
        localStorage.setItem("yahooTeams", JSON.stringify(teams));
      }
    });
  }

  private buildTeamsStream(): Observable<TeamsState> {
    const cachedTeams = this.loadCachedTeams();
    const hasCachedTeams = cachedTeams.length > 0;

    if (hasCachedTeams) {
      // Have cached teams: emit them immediately with loading-times status
      // Then fetch from Firestore (fast) to patch times
      // Then fetch from API (slow - container cold starts) to get full data
      // TODO: If we go away from cold starts then we can simplify this and stop hitting firestore directly
      return concat(
        of({
          status: "loading-times",
          teams: cachedTeams,
          schedule: undefined,
        } as const),
        from(this.fetchFirestoreDataAndPatch(cachedTeams)).pipe(
          switchMap((patchedState) =>
            concat(
              of(patchedState),
              // Background API fetch - silently updates teams
              from(this.fetchTeamsFromApi()).pipe(
                map(
                  (apiTeams) =>
                    ({
                      status: "ready",
                      teams: apiTeams,
                      schedule: patchedState.schedule,
                    }) as const,
                ),
                catchError((err) => {
                  // API failed but we still have firestore-patched data
                  console.error("Background API fetch failed:", err);
                  return of(patchedState);
                }),
              ),
            ),
          ),
        ),
      );
    }

    // No cached teams: show skeleton, fetch everything
    return concat(
      of({
        status: "loading-initial",
        teams: [],
        schedule: undefined,
      } as const),
      from(this.fetchAllData()).pipe(
        map(
          ({ teams, schedule }) =>
            ({
              status: "ready",
              teams,
              schedule,
            }) as const,
        ),
      ),
    );
  }

  private async fetchFirestoreDataAndPatch(
    cachedTeams: readonly ClientTeam[],
  ): Promise<ReadyState> {
    const [firestoreTeams, schedule] = await Promise.all([
      this.api.fetchTeamsFirestore(),
      this.api.fetchSchedulesFirestore(),
    ]);

    const patchedTeams = this.patchTeamsWithFirestore(cachedTeams, firestoreTeams);

    return {
      status: "ready",
      teams: patchedTeams,
      schedule,
    };
  }

  private patchTeamsWithFirestore(
    cachedTeams: readonly ClientTeam[],
    firestoreTeams: readonly FirestoreTeam[],
  ): readonly ClientTeam[] {
    return cachedTeams.map((cachedTeam) => {
      const firestoreTeam = firestoreTeams.find((ft) => ft.team_key === cachedTeam.team_key);
      if (firestoreTeam) {
        return { ...cachedTeam, ...firestoreTeam };
      }
      return cachedTeam;
    });
  }

  private async fetchAllData(): Promise<{ teams: ClientTeam[]; schedule: Schedule }> {
    const [teams, schedule] = await Promise.all([
      this.fetchTeamsFromApi(),
      this.api.fetchSchedulesFirestore(),
    ]);
    return { teams, schedule };
  }

  private async fetchTeamsFromApi(): Promise<ClientTeam[]> {
    try {
      return await this.api.fetchTeamsYahoo();
    } catch (err) {
      const errorMsg = getErrorMessage(err);

      if (errorMsg.includes(YAHOO_AUTH_REQUIRED_CODE)) {
        throw new Error("Refresh Token Error");
      }

      if (errorMsg.includes("token") || errorMsg.includes("auth")) {
        throw new Error("Refresh Token Error");
      }

      throw new Error(`Error fetching teams from Yahoo: ${errorMsg}`);
    }
  }

  private loadCachedTeams(): readonly ClientTeam[] {
    const sessionTeams = this.loadSessionStorageTeams();
    if (isType(sessionTeams, ClientTeamSchema.array()) && sessionTeams.length > 0) {
      return sessionTeams;
    }

    const localTeams = this.loadLocalStorageTeams();
    if (isType(localTeams, ClientTeamSchema.array()) && localTeams.length > 0) {
      return localTeams;
    }

    return [];
  }

  optimisticallyUpdateTeam<K extends keyof ClientTeam>(
    teamKey: string,
    property: K,
    value: ClientTeam[K],
  ): void {
    this.optimisticUpdate$.next({
      teamKey,
      updater: (team) => ({ ...team, [property]: value }),
    });
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

  private handleFetchTeamsError(err: unknown): void {
    const errorMessage = getErrorMessage(err);

    const isYahooAuthError =
      errorMessage === "Refresh Token Error" || errorMessage.includes(YAHOO_AUTH_REQUIRED_CODE);

    if (isYahooAuthError) {
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
