export type SportsnetGamesResponse = {
  data: {
    0: {
      games: {
        details: {
          timestamp: number;
          status: string; // Would this be postponed on the day of?
        };
        visiting_team: {
          id: number;
          name: string;
          short_name: string;
          city: string;
        };
        home_team: {
          id: number;
          name: string;
          short_name: string;
          city: string;
        };
      }[];
    };
  };
};
