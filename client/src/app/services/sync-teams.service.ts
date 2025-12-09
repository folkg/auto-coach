import type { Schedule } from "@common/types/Schedule";
import type { ClientTeam } from "@common/types/team";

import { inject, Injectable } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import { ClientTeam as ClientTeamSchema } from "@common/types/team";
import { isDefined, isType } from "@common/utilities/checks";
import { getErrorMessage } from "@common/utilities/error";
import {
  BehaviorSubject,
  catchError,
  concat,
  combineLatest,
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

interface LoadingStaleState extends BaseTeamsState {
  readonly status: "loading-stale";
}

interface ReadyState extends BaseTeamsState {
  readonly status: "ready";
}

interface ErrorState extends BaseTeamsState {
  readonly status: "error";
  readonly error: string;
}

export type TeamsState = LoadingInitialState | LoadingStaleState | ReadyState | ErrorState;

const YAHOO_AUTH_REQUIRED_CODE = "YAHOO_AUTH_REQUIRED";

@Injectable({
  providedIn: "root",
})
export class SyncTeamsService {
  private readonly api = inject(APIService);
  private readonly auth = inject(AuthService);
  readonly dialog = inject(MatDialog);

  private readonly refetch$ = new Subject<void>();
  private readonly teamsSubject = new BehaviorSubject<readonly ClientTeam[]>([]);
  private readonly scheduleSubject = new BehaviorSubject<Schedule | undefined>(undefined);

  readonly teams$ = this.teamsSubject.asObservable();
  readonly schedule$ = this.scheduleSubject.asObservable();
  readonly teamsState$: Observable<TeamsState>;

  constructor() {
    this.teamsState$ = combineLatest([
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

    this.teamsState$
      .pipe(
        takeUntilDestroyed(),
        map((state) => state.teams),
      )
      .subscribe(this.teamsSubject);

    this.teamsState$
      .pipe(
        takeUntilDestroyed(),
        map((state) => state.schedule),
        filter(isDefined),
      )
      .subscribe(this.scheduleSubject);

    this.teams$.pipe(takeUntilDestroyed()).subscribe((teams) => {
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
      return concat(
        of({
          status: "loading-stale",
          teams: cachedTeams,
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

  private async fetchAllData(): Promise<{ teams: ClientTeam[]; schedule: Schedule }> {
    const [teams, schedule] = await Promise.all([this.fetchTeams(), this.api.fetchSchedules()]);
    return { teams, schedule };
  }

  private async fetchTeams(): Promise<ClientTeam[]> {
    try {
      return await this.api.fetchTeams();
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
