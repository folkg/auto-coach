// biome-ignore lint/style/useImportType: This is an injection token
import { BreakpointObserver, Breakpoints } from "@angular/cdk/layout";
import { AsyncPipe, NgIf } from "@angular/common";
import { Component, computed } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { MatIconButton } from "@angular/material/button";
import { MatIcon } from "@angular/material/icon";
import { MatListItem, MatNavList } from "@angular/material/list";
import {
  MatSidenav,
  MatSidenavContainer,
  MatSidenavContent,
} from "@angular/material/sidenav";
import { MatToolbar } from "@angular/material/toolbar";
import { MatTooltip } from "@angular/material/tooltip";
import { RouterLink, RouterOutlet } from "@angular/router";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
// biome-ignore lint/style/useImportType: This is an injection token
import { AuthService } from "../services/auth.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { SyncTeamsService } from "../services/sync-teams.service";
// biome-ignore lint/style/useImportType: This is an injection token
import { ThemingService } from "../services/theming.service";
import { isDefined } from "../shared/utils/checks";
import { shareLatest } from "../shared/utils/shareLatest";

@Component({
  selector: "app-app-nav",
  templateUrl: "./app-nav.component.html",
  styleUrls: ["./app-nav.component.scss"],
  imports: [
    MatSidenavContainer,
    MatSidenav,
    MatToolbar,
    MatNavList,
    NgIf,
    MatListItem,
    RouterLink,
    MatSidenavContent,
    MatIconButton,
    MatIcon,
    MatTooltip,
    RouterOutlet,
    AsyncPipe,
  ],
})
export class AppNavComponent {
  readonly isHandset$: Observable<boolean> = this.breakpointObserver
    .observe(Breakpoints.Handset)
    .pipe(
      map((result) => result.matches),
      shareLatest(),
    );
  private readonly user = toSignal(this.auth.user$);
  readonly isLoggedIn = computed(() => isDefined(this.user()));

  private readonly teams = toSignal(this.sts.teams$, { initialValue: [] });
  readonly hasTransactionsEnabled = computed(() =>
    this.teams().some((team) => team.allow_transactions),
  );

  constructor(
    private readonly breakpointObserver: BreakpointObserver,
    readonly themingService: ThemingService,
    readonly auth: AuthService,
    private readonly sts: SyncTeamsService,
  ) {}

  toggleDarkMode() {
    this.themingService.darkModeOn = !this.themingService.darkModeOn;
  }
}
