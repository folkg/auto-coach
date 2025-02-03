import { render, screen } from "@testing-library/angular";
import { describe, expect, it } from "vitest";
import { NotfoundComponent } from "./notfound.component";

describe("NotfoundComponent", () => {
  it("renders the component", async () => {
    await render(NotfoundComponent);

    expect(
      screen.getByText("The page you are looking for does not exist."),
    ).toBeInTheDocument();
  });

  it("displays the correct message", async () => {
    await render(NotfoundComponent);

    expect(
      screen.getByText("The page you are looking for does not exist."),
    ).toBeInTheDocument();
  });
});
