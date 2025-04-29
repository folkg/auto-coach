// TODO: Where should this live?

export type YahooGamesReponse = {
  league: {
    games: {
      0: {
        game: {
          game_status: {
            type: string; // "status.type.postponed"
            description: string; // "Postponed"
            display_name: string; // "Ppd"
          };
          start_time: string; // Date as a string, eg. "Wed, 20 Mar 2024 10:05:00 +0000"
          team_ids: {
            [key in
              | "away_team_id"
              | "home_team_id"
              | "global_away_team_id"
              | "global_home_team_id"]: string;
          }[];
        };
      }[];
    };
  };
};
