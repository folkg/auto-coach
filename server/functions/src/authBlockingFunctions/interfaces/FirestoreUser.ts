export interface FirestoreUser {
  accessToken: string;
  refreshToken: string;
  tokenExpirationTime: number;
  isFreeTrialActivated: boolean;
  subscriptionExpirationTime: number;
}
