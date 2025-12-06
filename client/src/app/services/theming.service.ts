import { ApplicationRef, Injectable } from "@angular/core";
import { type } from "arktype";
import { BehaviorSubject } from "rxjs";

@Injectable({
  providedIn: "root",
})
export class ThemingService {
  themes = ["dark-theme", "light-theme"];
  theme$ = new BehaviorSubject("light-theme"); // initial theme
  private _darkModeOn: boolean;
  public get darkModeOn(): boolean {
    return this._darkModeOn;
  }
  public set darkModeOn(value: boolean) {
    this._darkModeOn = value;
    this.theme$.next(this.darkModeOn ? "dark-theme" : "light-theme");
    localStorage.setItem("darkModeOn", JSON.stringify(this.darkModeOn));
  }

  constructor(private readonly ref: ApplicationRef) {
    const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    if (localStorage.getItem("darkModeOn") !== null) {
      const storedValue = JSON.parse(localStorage.getItem("darkModeOn") ?? "false");
      const darkMode = type("boolean").assert(storedValue);
      this._darkModeOn = darkMode;
    } else {
      this._darkModeOn = darkMediaQuery.matches;
    }

    if (this.darkModeOn) {
      this.theme$.next("dark-theme");
    }

    // Watch for changes of the system preference
    darkMediaQuery.addEventListener("change", () => {
      this.darkModeOn = darkMediaQuery.matches;
      this.theme$.next(this.darkModeOn ? "dark-theme" : "light-theme");

      // Trigger refresh of UI
      this.ref.tick();
    });
  }
}
