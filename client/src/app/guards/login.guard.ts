import { map } from "rxjs";
import { inject } from "@angular/core";
import { type CanActivateFn, Router } from "@angular/router";
import { AuthService } from "../services/auth.service";

export const loginGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(AuthService);

  return auth.user$.pipe(
    map((user) => {
      if (user) {
        router.navigate(["/teams"]).catch(console.error);
        return false;
      }
      return true;
    }),
  );
};
