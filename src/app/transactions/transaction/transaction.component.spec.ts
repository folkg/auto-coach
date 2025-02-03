import { type ComponentFixture, TestBed } from "@angular/core/testing";

import { describe } from "vitest";
import { TransactionComponent } from "./transaction.component";

describe.todo("TransactionComponent", () => {
  let component: TransactionComponent;
  let fixture: ComponentFixture<TransactionComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TransactionComponent],
    });
    fixture = TestBed.createComponent(TransactionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
