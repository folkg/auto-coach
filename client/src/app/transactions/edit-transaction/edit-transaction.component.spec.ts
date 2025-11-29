import { beforeEach, describe, expect, it } from "vitest";
import { type ComponentFixture, TestBed } from "@angular/core/testing";
import { EditTransactionComponent } from "./edit-transaction.component";

describe.todo("EditTransactionComponent", () => {
  let component: EditTransactionComponent;
  let fixture: ComponentFixture<EditTransactionComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EditTransactionComponent],
    });
    fixture = TestBed.createComponent(EditTransactionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });
});
