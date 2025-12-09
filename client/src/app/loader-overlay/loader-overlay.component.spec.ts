import { render, screen } from "@testing-library/angular";
import { describe, expect, it } from "vitest";

import { LoaderComponent } from "../loader/loader.component";
import { LoaderOverlayComponent } from "./loader-overlay.component";

describe("LoaderOverlayComponent", () => {
  it("renders overlay and loader when loading is true", async () => {
    await render(LoaderOverlayComponent, {
      componentProperties: { loading: true },
      imports: [LoaderComponent],
    });

    const overlay = screen.getByTestId("loader-overlay-container");
    expect(overlay).toBeTruthy();

    // The loader should be present inside the overlay
    const loader = overlay.querySelector(".loading-animation");
    expect(loader).toBeTruthy();
  });

  it("does not render overlay when loading is false", async () => {
    await render(LoaderOverlayComponent, {
      componentProperties: { loading: false },
      imports: [LoaderComponent],
    });

    expect(screen.queryByTestId("loader-overlay-container")).toBeNull();
  });
});
