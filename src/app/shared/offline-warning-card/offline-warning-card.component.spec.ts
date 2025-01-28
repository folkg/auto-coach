import { ComponentFixture, TestBed } from "@angular/core/testing";

import { OfflineWarningCardComponent } from "./offline-warning-card.component";

describe("OfflineWarningCardComponent", () => {
  let component: OfflineWarningCardComponent;
  let fixture: ComponentFixture<OfflineWarningCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfflineWarningCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(OfflineWarningCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
