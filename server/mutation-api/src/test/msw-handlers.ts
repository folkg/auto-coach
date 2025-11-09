import { HttpResponse, http } from "msw";

// Types for Yahoo API responses
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

// Helper to create game times at specific intervals from now
function createGameTime(minutesFromNow: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutesFromNow);
  return date.toISOString();
}

// Factory functions for creating mock responses
export function createYahooGamesResponse(
  games: readonly YahooGame[],
): YahooGamesResponse {
  return {
    league: {
      games: {
        0: games,
      },
    },
  };
}

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

// Sportsnet API types
interface SportsnetGame {
  readonly details: {
    readonly timestamp: number;
    readonly status: string;
  };
}

interface SportsnetGamesResponse {
  readonly data: {
    readonly 0: {
      readonly games: readonly SportsnetGame[];
    };
  };
}

export function createSportsnetGamesResponse(
  games: readonly SportsnetGame[],
): SportsnetGamesResponse {
  return {
    data: {
      0: {
        games,
      },
    },
  };
}

export function createSportsnetGame(
  options: { readonly timestamp?: number; readonly status?: string } = {},
): SportsnetGame {
  return {
    details: {
      timestamp: options.timestamp ?? Math.floor(Date.now() / 1000) + 1800, // 30 min from now
      status: options.status ?? "scheduled",
    },
  };
}

// Default handlers for the most common scenarios
export const handlers = [
  // Yahoo Sports Editorial API - Games schedule
  http.get(
    "https://api-secure.sports.yahoo.com/v1/editorial/league/:league/games*",
    ({ params }) => {
      const league = params.league as string;

      // Create a game starting in 30 minutes for each league
      const game = createYahooGame({
        startTime: createGameTime(30),
        awayTeamId: `${league}-team-away`,
        homeTeamId: `${league}-team-home`,
      });

      return HttpResponse.json(createYahooGamesResponse([game]));
    },
  ),

  // Sportsnet API - Fallback for game times
  http.get("https://mobile-statsv2.sportsnet.ca/scores*", () => {
    const game = createSportsnetGame({
      timestamp: Math.floor(Date.now() / 1000) + 1800, // 30 min from now
    });

    return HttpResponse.json(createSportsnetGamesResponse([game]));
  }),

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

// Handler factories for specific test scenarios
export const yahooHandlers = {
  /**
   * Creates a handler that returns games at specific times
   */
  gamesAtTimes: (
    league: string,
    gameTimesMinutesFromNow: readonly number[],
  ) => {
    const games = gameTimesMinutesFromNow.map((minutes) =>
      createYahooGame({
        startTime: createGameTime(minutes),
      }),
    );

    return http.get(
      `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games*`,
      () => {
        return HttpResponse.json(createYahooGamesResponse(games));
      },
    );
  },

  /**
   * Creates a handler that returns postponed games
   */
  postponedGames: (
    league: string,
    postponedTeamIds: readonly { away: string; home: string }[],
  ) => {
    const games = postponedTeamIds.map(({ away, home }) =>
      createYahooGame({
        status: "status.type.postponed",
        awayTeamId: away,
        homeTeamId: home,
      }),
    );

    return http.get(
      `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games*`,
      () => {
        return HttpResponse.json(createYahooGamesResponse(games));
      },
    );
  },

  /**
   * Creates a handler that returns no games
   */
  noGames: (league: string) => {
    return http.get(
      `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games*`,
      () => {
        return HttpResponse.json(createYahooGamesResponse([]));
      },
    );
  },

  /**
   * Creates a handler that returns an error
   */
  error: (league: string, statusCode = 500) => {
    return http.get(
      `https://api-secure.sports.yahoo.com/v1/editorial/league/${league}/games*`,
      () => {
        return HttpResponse.json(
          { error: "Internal Server Error" },
          { status: statusCode },
        );
      },
    );
  },
};

export const sportsnetHandlers = {
  /**
   * Creates a handler that returns games at specific times
   */
  gamesAtTimes: (_league: string, timestampsSeconds: readonly number[]) => {
    const games = timestampsSeconds.map((timestamp) =>
      createSportsnetGame({ timestamp }),
    );

    return http.get("https://mobile-statsv2.sportsnet.ca/scores*", () => {
      return HttpResponse.json(createSportsnetGamesResponse(games));
    });
  },

  /**
   * Creates a handler that returns an error
   */
  error: (statusCode = 500) => {
    return http.get("https://mobile-statsv2.sportsnet.ca/scores*", () => {
      return HttpResponse.json(
        { error: "Internal Server Error" },
        { status: statusCode },
      );
    });
  },
};
