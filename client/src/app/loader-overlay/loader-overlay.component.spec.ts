import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/angular";
import { LoaderComponent } from "../loader/loader.component";
import { LoaderOverlayComponent } from "./loader-overlay.component";

describe("LoaderOverlayComponent", () => {
  it("renders overlay and loader when loading is true", async () => {
    await render(LoaderOverlayComponent, {
      componentProperties: { loading: true },
      imports: [LoaderComponent],
    });

    const overlay = screen.getByTestId("loader-overlay-container");
    expect(overlay).toBeInTheDocument();

    // The loader should be present inside the overlay
    const loader = overlay.querySelector(".loading-animation");
    expect(loader).toBeTruthy();
  });

  it("does not render overlay when loading is false", async () => {
    await render(LoaderOverlayComponent, {
      componentProperties: { loading: false },
      imports: [LoaderComponent],
    });

    expect(screen.queryByTestId("loader-overlay-container")).not.toBeInTheDocument();
  });
});
