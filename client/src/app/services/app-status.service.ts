import type { Spacetime } from "spacetime";
import { fromEvent, map, merge, type Observable, of, startWith } from "rxjs";
import { Injectable } from "@angular/core";
import { spacetimeNow } from "../shared/utils/now";
import { shareLatest } from "../shared/utils/shareLatest";

@Injectable({
  providedIn: "root",
})
export class AppStatusService {
  readonly online$: Observable<boolean>;
  readonly focus$: Observable<Spacetime>;

  constructor() {
    this.online$ = merge(of(null), fromEvent(window, "online"), fromEvent(window, "offline")).pipe(
      map(() => navigator.onLine),
      shareLatest(),
    );

    this.focus$ = fromEvent(window, "focus").pipe(map(spacetimeNow), startWith(spacetimeNow()));
  }
}
