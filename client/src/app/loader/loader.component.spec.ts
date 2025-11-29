import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/angular";
import { LoaderComponent } from "./loader.component";

describe("LoaderComponent", () => {
  it("renders four animated balls", async () => {
    await render(LoaderComponent);

    const loader = screen.getByTestId("loader-animation");
    expect(loader).toBeInTheDocument();

    // Should render all four balls with correct classes
    expect(loader.querySelector(".ball.football")).toBeTruthy();
    expect(loader.querySelector(".ball.basketball")).toBeTruthy();
    expect(loader.querySelector(".ball.baseball")).toBeTruthy();
    expect(loader.querySelector(".ball.hockey-puck")).toBeTruthy();
  });

  it("reserves enough vertical space for the bounce animation", async () => {
    const { container } = await render(LoaderComponent);

    const loader = container.querySelector(".loading-animation") as HTMLElement;
    // The height should be at least 4rem (as set in the SCSS)
    // We check the computed style to ensure the height is correct
    const height = getComputedStyle(loader).height;
    // Accept a small margin for rounding differences
    const minHeightPx = 4 * 16 - 2; // 4rem * 16px/rem - fudge factor
    expect(Number.parseFloat(height)).toBeGreaterThanOrEqual(minHeightPx);
  });
});
