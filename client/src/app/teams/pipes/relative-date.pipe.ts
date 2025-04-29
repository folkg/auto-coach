import { Pipe, type PipeTransform } from "@angular/core";

@Pipe({
  name: "relativeDate",
  standalone: true,
})
export class RelativeDatePipe implements PipeTransform {
  transform(timestamp: number | null): string {
    const now = new Date();
    if (timestamp !== null) {
      const date = new Date(timestamp);
      // if the timstamp is today, just return the HH:MM
      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      ) {
        return date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });
      }

      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate() - 1
      ) {
        // if the timestamp is yesterday, return 'Yesterday' HH:MM
        return `Yesterday ${date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}`;
      }

      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate() + 1
      ) {
        // if the timstamp is tomorrow, return 'Tomorrow' HH:MM
        return `Tomorrow ${date.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        })}`;
      }

      // if the timestamp is older than yesterday or after tomorrow, return 'MMM DD' HH:MM
      return `${date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })}, ${date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`;
    }
    return "";
  }
}
