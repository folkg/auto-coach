import { Component, HostBinding, Input } from "@angular/core";

@Component({
  selector: "app-loader",
  standalone: true,
  templateUrl: "./loader.component.html",
  styleUrl: "./loader.component.scss",
})
export class LoaderComponent {
  /**
   * Loader size: 'small' (default, fixed size) or 'responsive' (scales with viewport)
   */
  @Input() size: "small" | "responsive" = "small";

  @HostBinding("class.responsive")
  get isResponsive(): boolean {
    return this.size === "responsive";
  }
}
