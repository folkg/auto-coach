import { Injectable } from "@angular/core";
// biome-ignore lint/style/useImportType: This is an injection token
import { MatDialog } from "@angular/material/dialog";
import type { UrlTree } from "@angular/router";
import { lastValueFrom, type Observable } from "rxjs";

import {
  ConfirmDialogComponent,
  type DialogData,
} from "../shared/confirm-dialog/confirm-dialog.component";

export interface ComponentCanDeactivate {
  canDeactivate: () => boolean;
}

@Injectable({
  providedIn: "root",
})
export class DirtyFormGuard {
  constructor(public dialog: MatDialog) {}

  confirmDialog(): Promise<boolean> {
    const title = "WARNING: You have unsaved changes";
    const message =
      "Press Cancel to stay and save these changes, or Proceed to leave this page and lose these changes.";
    const dialogData: DialogData = {
      title,
      message,
      trueButton: "Proceed",
      falseButton: "Cancel",
    };
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      minWidth: "350px",
      width: "90%",
      maxWidth: "500px",
      data: dialogData,
    });

    return lastValueFrom(dialogRef.afterClosed());
  }

  canDeactivate(
    component: ComponentCanDeactivate,
  ):
    | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree {
    //TODO:Make it a dialog
    return component.canDeactivate() ? true : this.confirmDialog();
  }
}
