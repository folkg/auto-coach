import { type ComponentFixture, TestBed } from "@angular/core/testing";

import { describe } from "vitest";
import { PlayerComponent } from "./player.component";

describe.todo("PlayerComponent", () => {
  let component: PlayerComponent;
  let fixture: ComponentFixture<PlayerComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlayerComponent],
    });
    fixture = TestBed.createComponent(PlayerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
