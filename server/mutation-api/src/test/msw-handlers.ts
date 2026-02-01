import { HttpResponse, http } from "msw";

// Types for Yahoo Graphite API responses (new endpoints)
interface YahooGraphiteGame {
  readonly gameId: string;
  readonly startTime: string;
  readonly status: string;
}

interface YahooLeagueGameIdsByDateResponse {
  readonly data: {
    readonly leagues: readonly {
      readonly games: readonly YahooGraphiteGame[];
    }[];
  };
}

interface YahooScoreboardGameResponse {
  readonly data: {
    readonly games: readonly {
      readonly awayTeamId: string;
      readonly homeTeamId: string;
      readonly startTime: string;
      readonly gameStatus: string;
    }[];
  };
}

// Helper to create game times at specific intervals from now
function createGameTime(minutesFromNow: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);
  return date.toISOString();
}

// Factory functions for creating mock responses
export function createYahooLeagueGamesResponse(
  games: readonly YahooGraphiteGame[],
): YahooLeagueGameIdsByDateResponse {
  return {
    data: {
      leagues: [{ games }],
    },
  };
}

export function createYahooScoreboardGameResponse(
  awayTeamId: string,
  homeTeamId: string,
  startTime: string,
  gameStatus: string,
): YahooScoreboardGameResponse {
  return {
    data: {
      games: [{ awayTeamId, homeTeamId, startTime, gameStatus }],
    },
  };
}

export function createYahooGraphiteGame(
  options: {
    readonly gameId?: string;
    readonly startTime?: string;
    readonly status?: string;
  } = {},
): YahooGraphiteGame {
  return {
    gameId: options.gameId ?? `nhl.g.${Date.now()}`,
    startTime: options.startTime ?? createGameTime(30),
    status: options.status ?? "PREGAME",
  };
}

/**
 * @deprecated Use createYahooLeagueGamesResponse instead for new Graphite API tests.
 * Legacy types kept for backward compatibility during migration.
 */
interface YahooGame {
  readonly game: {
    readonly game_status: {
      readonly type: string;
    };
    readonly start_time: string;
    readonly team_ids: ReadonlyArray<{
      readonly away_team_id?: string;
      readonly home_team_id?: string;
    }>;
  };
}

interface YahooGamesResponse {
  readonly league: {
    readonly games: {
      readonly 0: readonly YahooGame[];
    };
  };
}

/**
 * @deprecated Use createYahooLeagueGamesResponse instead.
 */
export function createYahooGamesResponse(games: readonly YahooGame[]): YahooGamesResponse {
  return {
    league: {
      games: {
        0: games,
      },
    },
  };
}

/**
 * @deprecated Use createYahooGraphiteGame instead.
 */
export function createYahooGame(
  options: {
    readonly startTime?: string;
    readonly status?: string;
    readonly awayTeamId?: string;
    readonly homeTeamId?: string;
  } = {},
): YahooGame {
  return {
    game: {
      game_status: {
        type: options.status ?? "status.type.scheduled",
      },
      start_time: options.startTime ?? createGameTime(30),
      team_ids: [
        { away_team_id: options.awayTeamId ?? "team-away-1" },
        { home_team_id: options.homeTeamId ?? "team-home-1" },
      ],
    },
  };
}

// Sportsnet Ticker API types (new endpoint: stats-api.sportsnet.ca/ticker)
interface SportsnetTickerTeam {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly city: string;
}

interface SportsnetTickerGame {
  readonly game_status: string;
  readonly timestamp: number;
  readonly visiting_team: SportsnetTickerTeam;
  readonly home_team: SportsnetTickerTeam;
}

interface SportsnetTickerResponse {
  readonly status: string;
  readonly data: {
    readonly games: readonly SportsnetTickerGame[];
  };
}

export function createSportsnetTickerResponse(
  games: readonly SportsnetTickerGame[],
): SportsnetTickerResponse {
  return {
    status: "OK",
    data: {
      games,
    },
  };
}

export function createSportsnetTickerGame(
  options: {
    readonly timestamp?: number;
    readonly gameStatus?: string;
    readonly visitingTeamId?: string;
    readonly homeTeamId?: string;
  } = {},
): SportsnetTickerGame {
  return {
    game_status: options.gameStatus ?? "Scheduled",
    timestamp: options.timestamp ?? Math.floor(Date.now() / 1000) + 1800, // 30 min from now
    visiting_team: {
      id: options.visitingTeamId ?? "visiting-team-id",
      name: "Visiting Team",
      short_name: "VIS",
      city: "Visitor City",
    },
    home_team: {
      id: options.homeTeamId ?? "home-team-id",
      name: "Home Team",
      short_name: "HOM",
      city: "Home City",
    },
  };
}

// Default handlers for the most common scenarios
export const handlers = [
  // Yahoo Graphite API - leagueGameIdsByDate endpoint (new)
  http.get("https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*", () => {
    const game = createYahooGraphiteGame({
      startTime: createGameTime(30),
    });

    return HttpResponse.json(createYahooLeagueGamesResponse([game]));
  }),

  // Yahoo Graphite API - scoreboardGame endpoint (new)
  http.get(
    "https://graphite.sports.yahoo.com/v1/query/shangrila/scoreboardGame*",
    ({ request }) => {
      const gameIdMatch = request.url.match(/gameId=([^&]+)/);
      const gameId = gameIdMatch?.[1] ?? "nhl.g.123";
      const league = gameId.split(".")[0];

      return HttpResponse.json(
        createYahooScoreboardGameResponse(
          `${league}.t.1`,
          `${league}.t.2`,
          createGameTime(30),
          "PREGAME",
        ),
      );
    },
  ),

  // Yahoo Fantasy API mock handlers
  http.get("https://fantasysports.yahooapis.com/*", () => {
    return HttpResponse.json({
      fantasy_content: {
        league: {
          name: "Mock League",
          league_key: "test.l.12345",
        },
      },
    });
  }),

  http.post("https://fantasysports.yahooapis.com/*", () => {
    return HttpResponse.json({
      fantasy_content: {
        transaction: {
          status: "success",
        },
      },
    });
  }),

  http.put("https://fantasysports.yahooapis.com/*", () => {
    return HttpResponse.json({
      fantasy_content: {
        roster: {
          status: "success",
        },
      },
    });
  }),
];

// State for tracking scoreboardGame requests (needed for postponed games tests)
const postponedGameTeams = new Map<string, { away: string; home: string }>();

// Handler factories for specific test scenarios
export const yahooHandlers = {
  /**
   * Creates a handler that returns games at specific times using the new Graphite API
   */
  gamesAtTimes: (league: string, gameTimesMinutesFromNow: readonly number[]) => {
    const games = gameTimesMinutesFromNow.map((minutes, index) =>
      createYahooGraphiteGame({
        gameId: `${league}.g.${Date.now() + index}`,
        startTime: createGameTime(minutes),
      }),
    );

    return http.get(
      "https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*",
      () => {
        return HttpResponse.json(createYahooLeagueGamesResponse(games));
      },
    );
  },

  /**
   * Creates handlers for postponed games using the new Graphite API.
   * Returns two handlers: one for leagueGameIdsByDate and one for scoreboardGame.
   */
  postponedGames: (league: string, postponedTeamIds: readonly { away: string; home: string }[]) => {
    // Create games with POSTPONED status
    const games = postponedTeamIds.map(({ away, home }, index) => {
      const gameId = `${league}.g.postponed${index}`;
      // Store the team IDs for the scoreboardGame handler
      postponedGameTeams.set(gameId, { away, home });
      return createYahooGraphiteGame({
        gameId,
        status: "POSTPONED",
      });
    });

    // Return the leagueGameIdsByDate handler
    return http.get(
      "https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*",
      () => {
        return HttpResponse.json(createYahooLeagueGamesResponse(games));
      },
    );
  },

  /**
   * Creates a handler for scoreboardGame that returns the correct team IDs for postponed games
   */
  scoreboardGameForPostponed: () => {
    return http.get(
      "https://graphite.sports.yahoo.com/v1/query/shangrila/scoreboardGame*",
      ({ request }) => {
        const gameIdMatch = request.url.match(/gameId=([^&]+)/);
        const gameId = gameIdMatch?.[1] ?? "";
        const teams = postponedGameTeams.get(gameId);

        if (teams) {
          return HttpResponse.json(
            createYahooScoreboardGameResponse(
              teams.away,
              teams.home,
              createGameTime(30),
              "POSTPONED",
            ),
          );
        }

        // Default response for non-postponed games
        return HttpResponse.json(
          createYahooScoreboardGameResponse("team.t.1", "team.t.2", createGameTime(30), "PREGAME"),
        );
      },
    );
  },

  /**
   * Creates a handler that returns no games
   */
  noGames: (league: string) => {
    return http.get(
      "https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*",
      ({ request }) => {
        const leaguesMatch = request.url.match(/leagues=([^&]+)/);
        const leagueParam = leaguesMatch?.[1];
        if (leagueParam === league) {
          return HttpResponse.json(createYahooLeagueGamesResponse([]));
        }
        // For other leagues, return a default game
        return HttpResponse.json(
          createYahooLeagueGamesResponse([
            createYahooGraphiteGame({ startTime: createGameTime(30) }),
          ]),
        );
      },
    );
  },

  /**
   * Creates a handler that returns an error for a specific league
   */
  error: (league: string, statusCode = 500) => {
    return http.get(
      "https://graphite.sports.yahoo.com/v1/query/shangrila/leagueGameIdsByDate*",
      ({ request }) => {
        const leaguesMatch = request.url.match(/leagues=([^&]+)/);
        const leagueParam = leaguesMatch?.[1];
        if (leagueParam === league) {
          return HttpResponse.json({ error: "Internal Server Error" }, { status: statusCode });
        }
        // For other leagues, return a default game
        return HttpResponse.json(
          createYahooLeagueGamesResponse([
            createYahooGraphiteGame({ startTime: createGameTime(30) }),
          ]),
        );
      },
    );
  },

  /**
   * Clears the postponed game teams state (call in afterEach)
   */
  clearPostponedState: () => {
    postponedGameTeams.clear();
  },
};

export const sportsnetHandlers = {
  /**
   * Creates a handler that returns games at specific times
   */
  gamesAtTimes: (_league: string, timestampsSeconds: readonly number[]) => {
    const games = timestampsSeconds.map((timestamp) => createSportsnetTickerGame({ timestamp }));

    return http.get("https://stats-api.sportsnet.ca/ticker*", () => {
      return HttpResponse.json(createSportsnetTickerResponse(games));
    });
  },

  /**
   * Creates a handler that returns postponed games
   */
  postponedGames: (
    _league: string,
    postponedTeamIds: readonly { away: string; home: string }[],
  ) => {
    const games = postponedTeamIds.map(({ away, home }) =>
      createSportsnetTickerGame({
        gameStatus: "Postponed",
        visitingTeamId: away,
        homeTeamId: home,
      }),
    );

    return http.get("https://stats-api.sportsnet.ca/ticker*", () => {
      return HttpResponse.json(createSportsnetTickerResponse(games));
    });
  },

  /**
   * Creates a handler that returns an error
   */
  error: (statusCode = 500) => {
    return http.get("https://stats-api.sportsnet.ca/ticker*", () => {
      return HttpResponse.json({ error: "Internal Server Error" }, { status: statusCode });
    });
  },
};
