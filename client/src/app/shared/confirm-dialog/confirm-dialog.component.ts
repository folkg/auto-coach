import type { Subscription } from "rxjs";

import { CdkScrollable } from "@angular/cdk/scrolling";
import { NgIf } from "@angular/common";
import { Component, Inject, type OnDestroy, type OnInit } from "@angular/core";
import { MatButton } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from "@angular/material/dialog";

@Component({
  selector: "app-confirm-dialog",
  templateUrl: "./confirm-dialog.component.html",
  styleUrls: ["./confirm-dialog.component.scss"],
  imports: [MatDialogTitle, CdkScrollable, MatDialogContent, MatDialogActions, NgIf, MatButton],
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  title: string;
  message: string;
  trueButton: string;
  falseButton: string;
  private keySubscription: Subscription | undefined;
  private clickSubscription: Subscription | undefined;

  constructor(
    readonly dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) readonly data: DialogData,
  ) {
    this.title = data.title;
    this.message = data.message;
    this.trueButton = data.trueButton ?? "";
    this.falseButton = data.falseButton ?? "";
  }

  ngOnInit() {
    this.keySubscription = this.dialogRef.keydownEvents().subscribe((event) => {
      if (event.key === "Escape") {
        this.onDismiss();
      }
    });

    this.clickSubscription = this.dialogRef.backdropClick().subscribe(() => this.onDismiss());
  }

  ngOnDestroy(): void {
    this.keySubscription?.unsubscribe();
    this.clickSubscription?.unsubscribe();
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onDismiss(): void {
    this.dialogRef.close(false);
  }
}

export interface DialogData {
  title: string;
  message: string;
  trueButton?: string;
  falseButton?: string;
}
