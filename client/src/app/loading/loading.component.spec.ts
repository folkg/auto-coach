import { render, screen } from "@testing-library/angular";
import { describe, expect, it } from "vitest";
import { LoadingComponent } from "./loading.component";

describe("LoadingComponent", () => {
  it("shows loading animation when loading is true", async () => {
    await render(LoadingComponent, {
      inputs: { loading: true },
    });

    expect(screen.getByTestId("loading-container")).toBeInTheDocument();
  });

  it("does not show loading animation when loading is false", async () => {
    await render(LoadingComponent, {
      inputs: { loading: false },
    });

    expect(screen.queryByTestId("loading-container")).not.toBeInTheDocument();
  });
});
