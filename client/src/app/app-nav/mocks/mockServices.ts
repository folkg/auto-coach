import { Injectable } from "@angular/core";
import type { ClientTeam } from "@common/types/team";
import type { User } from "firebase/auth";
import { type Observable, of } from "rxjs";
import { createMock } from "../../../__mocks__/utils/createMock";

@Injectable({
  providedIn: "root",
})
export class MockAuthService {
  user$: Observable<User> = of(createMock<User>({ displayName: "John Doe" }));
}
export class MockSyncTeamsService {
  teams$: Observable<ClientTeam[]> = of([
    createMock<ClientTeam>({ allow_transactions: false }),
    createMock<ClientTeam>({ allow_transactions: true }),
  ]);
}
