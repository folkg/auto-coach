import { OverlayContainer } from "@angular/cdk/overlay";
import { Component, HostBinding, inject, type OnInit } from "@angular/core";
import { pairwise, startWith } from "rxjs";

import { AppNavComponent } from "./app-nav/app-nav.component";
import { ThemingService } from "./services/theming.service";

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss"],
  imports: [AppNavComponent],
})
export class AppComponent implements OnInit {
  @HostBinding("class") public cssClass!: string;

  private readonly themingService = inject(ThemingService);
  private readonly overlayContainer = inject(OverlayContainer);

  ngOnInit(): void {
    this.themingService.theme$
      .pipe(startWith(undefined), pairwise())
      .subscribe(([oldTheme, newTheme]) => {
        if (newTheme !== undefined) {
          this.cssClass = newTheme;

          //overlayContainer is used for the mat-dialog
          this.overlayContainer.getContainerElement().classList.add(newTheme);
          if (oldTheme !== newTheme && oldTheme !== undefined) {
            //remove the oldTheme from the overlayContainer
            this.overlayContainer.getContainerElement().classList.remove(oldTheme);
          }
        }
      });
  }
}
