import { Injectable } from "@angular/core";
import type { Team } from "@common/types/team";
import type { User } from "@firebase/auth";
import { type Observable, of } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class MockAuthService {
  user$: Observable<User> = of({ name: "John Doe" } as unknown as User);
}
export class MockSyncTeamsService {
  teams$: Observable<Team[]> = of([
    { name: "Team 1", allow_transactions: false },
    { name: "Team 2", allow_transactions: true },
  ] as unknown as Team[]);
}
