import type { Subscription } from "rxjs";

import { CdkScrollable } from "@angular/cdk/scrolling";
import { NgIf } from "@angular/common";
import { Component, inject, type OnDestroy, type OnInit } from "@angular/core";
import { MatButton } from "@angular/material/button";
import { MatDialogRef } from "@angular/material/dialog";
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogTitle,
} from "@angular/material/dialog";

@Component({
  selector: "app-confirm-dialog",
  templateUrl: "./confirm-dialog.component.html",
  styleUrls: ["./confirm-dialog.component.scss"],
  imports: [MatDialogTitle, CdkScrollable, MatDialogContent, MatDialogActions, NgIf, MatButton],
})
export class ConfirmDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
  private readonly data = inject(MAT_DIALOG_DATA);

  title: string;
  message: string;
  trueButton: string;
  falseButton: string;
  private keySubscription: Subscription | undefined;
  private clickSubscription: Subscription | undefined;

  constructor() {
    this.title = this.data.title;
    this.message = this.data.message;
    this.trueButton = this.data.trueButton ?? "";
    this.falseButton = this.data.falseButton ?? "";
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
