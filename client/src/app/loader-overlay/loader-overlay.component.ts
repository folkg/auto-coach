import { NgIf } from "@angular/common";
import { Component, Input } from "@angular/core";

import { LoaderComponent } from "../loader/loader.component";

@Component({
  selector: "app-loader-overlay",
  standalone: true,
  imports: [NgIf, LoaderComponent],
  templateUrl: "./loader-overlay.component.html",
  styleUrl: "./loader-overlay.component.scss",
})
export class LoaderOverlayComponent {
  @Input() loading = false;
}
