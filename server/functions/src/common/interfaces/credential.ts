export interface ReturnCredential {
  accessToken: string;
  tokenExpirationTime: number;
}

export interface YahooRefreshRequestBody {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  refresh_token: string;
  grant_type: string;
}

export interface Token {
  accessToken: string;
  refreshToken: string;
  tokenExpirationTime: number;
}
