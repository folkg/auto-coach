export interface LineupChanges {
  teamKey: string;
  coverageType: string;
  coveragePeriod: string;
  newPlayerPositions: { [key: string]: string };
}
