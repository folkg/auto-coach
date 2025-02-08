import { Component, input } from "@angular/core";

@Component({
  selector: "app-loading",
  imports: [],
  templateUrl: "./loading.component.html",
  styleUrl: "./loading.component.scss",
})
export class LoadingComponent {
  loading = input(false);
}
