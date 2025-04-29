// Statuses to be considered a "healthy" player
// TODO: Does Game Time Decision count as healthy?
export const HEALTHY_STATUS_LIST = [
  "Healthy",
  "Questionable",
  "Probable",
  "Game Time Decision",
];
// Roster positions considered to be inactive
export const INACTIVE_POSITION_LIST = ["IR", "IR+", "IL", "IL+", "NA"];
export const LONG_TERM_IL_POSITIONS_LIST = ["IL", "IR"];

/**
 * Some Yahoo positions are super-positions and need to be broken down into their components when counting them.
 *
 * Reference:
 * https://help.yahoo.com/kb/position-abbreviations-fantasy-baseball-sln6796.html
 * https://help.yahoo.com/kb/position-abbreviations-fantasy-football-sln6500.html
 * https://help.yahoo.com/kb/position-abbreviations-fantasy-basketball-sln6927.html
 * https://help.yahoo.com/kb/position-abbreviations-fantasy-hockey-sln6835.html
 */
export const COMPOUND_POSITION_COMPOSITIONS: LeagueCompoundPositions = {
  mlb: {
    CI: ["1B", "3B"],
    MI: ["2B", "SS"],
    IF: ["1B", "2B", "3B", "SS"],
    OF: ["LF", "CF", "RF"],
    Util: [
      "1B",
      "2B",
      "3B",
      "SS",
      "C",
      "LF",
      "CF",
      "RF",
      "CI",
      "MI",
      "IF",
      "OF",
    ],
    P: ["SP", "RP"],
  },
  nfl: {
    "W/T": ["WR", "TE"],
    "W/R": ["WR", "RB"],
    "W/R/T": ["WR", "RB", "TE"],
    "Q/W/R/T": ["QB", "WR", "RB", "TE"],
    D: ["DL", "DB", "LB", "DT", "DE", "CB", "S"],
  },
  nba: {
    G: ["PG", "SG"],
    F: ["SF", "PF"],
    Util: ["PG", "SG", "SF", "PF", "C", "G", "F"],
  },
  nhl: {
    W: ["LW", "RW"],
    F: ["LW", "RW", "C"],
    Util: ["LW", "RW", "C", "D", "W", "F"],
  },
};
// TODO: Confirm the NBA composition, the description seems a little vague
type LeagueCompoundPositions = {
  [league: string]: {
    [position: string]: string[];
  };
};

/**
 * The number of extra players that can be "automatically" added to a specific position in each league by the tool
 * If the number is 0, then the tool will not add any extra players to that position
 * If the position is not listed, then no maximum will be enforced
 *
 * @type {LeagueMaxPositions}
 */
export const POSITIONAL_MAX_EXTRA_PLAYERS: LeagueMaxPositions = {
  mlb: { P: 6 },
  nfl: { QB: 0, K: 0, DEF: 0 },
  nba: {},
  nhl: { G: 2, D: 2 },
};

type LeagueMaxPositions = {
  [league: string]: {
    [position: string]: number;
  };
};
