import { beforeEach, describe, expect, it } from "vitest";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { RobotsComponent } from "./robots.component";

describe.todo("RobotsComponent", () => {
  let component: RobotsComponent;
  let fixture: ComponentFixture<RobotsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RobotsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RobotsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
