import { Pipe, type PipeTransform } from "@angular/core";

@Pipe({
  name: "nth",
  standalone: true,
})
export class NthPipe implements PipeTransform {
  transform(num: string | number): string {
    // generate the suffix for the number
    if (Number.isNaN(Number(num))) {
      return `${num}`;
    }
    const n = Number(num);
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
}
