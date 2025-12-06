import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, expect, it } from "vitest";

@Component({
  selector: "app-test",
  template: "<div>Test Component</div>",
  standalone: true,
})
class TestComponent {}

describe("Test Setup", () => {
  it("should configure TestBed", () => {
    // Arrange & Act
    TestBed.configureTestingModule({
      imports: [TestComponent],
    });

    // Assert
    expect(TestBed).toBeDefined();
  });

  it("should create a component", async () => {
    // Arrange
    await TestBed.configureTestingModule({
      imports: [TestComponent],
    }).compileComponents();

    // Act
    const fixture = TestBed.createComponent(TestComponent);
    fixture.detectChanges();

    // Assert
    expect(fixture).toBeDefined();
    expect(fixture.componentInstance).toBeDefined();
  });
});
