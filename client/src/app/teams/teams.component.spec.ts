import { type ComponentFixture, TestBed } from "@angular/core/testing";

import { describe } from "vitest";
import { TeamsComponent } from "./teams.component";

describe.todo("DashboardComponent", () => {
  let component: TeamsComponent;
  let fixture: ComponentFixture<TeamsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
