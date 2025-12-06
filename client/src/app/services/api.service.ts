import type { FeedbackData } from "@common/types/feedback";
import type { ClientTeam } from "@common/types/team";
import type { PostTransactionsResult, TransactionsData } from "@common/types/transactions";

import { Injectable, inject } from "@angular/core";
import { Schedule } from "@common/types/Schedule";
import { FirestoreTeam } from "@common/types/team";
import { assertType, isType } from "@common/utilities/checks";
import { type } from "arktype";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { HONO_CLIENT } from "../hono-client-config";
import { FIRESTORE } from "../shared/firebase-tokens";
import { AuthService } from "./auth.service";

@Injectable({
  providedIn: "root",
})
export class APIService {
  private readonly client = inject(HONO_CLIENT);
  private readonly firestore = inject(FIRESTORE);

  constructor(private readonly auth: AuthService) {}

  async fetchTeamsYahoo(): Promise<ClientTeam[]> {
    const response = await this.client.api.teams.$get({});
    if (!response.ok) {
      const errorCode = await extractErrorCode(response);
      throw new Error(errorCode);
    }
    return response.json();
  }

  async fetchTeamsFirestore(): Promise<FirestoreTeam[]> {
    const user = await this.auth.getUser();
    const db = this.firestore;

    const teamsRef = collection(db, "users", user.uid, "teams");
    const teamsSnapshot = await getDocs(query(teamsRef, where("end_date", ">=", Date.now())));

    return teamsSnapshot.docs.map((docSnapshot) => {
      const team = docSnapshot.data();
      assertType(team, FirestoreTeam);
      return team;
    });
  }

  async fetchTeamsPartial(): Promise<FirestoreTeam[]> {
    const response = await this.client.api.teams.partial.$get({});
    if (!response.ok) {
      const errorCode = await extractErrorCode(response);
      throw new Error(errorCode);
    }
    return response.json();
  }

  async fetchSchedulesFirestore(): Promise<Schedule> {
    const storedSchedule = sessionStorage.getItem("schedules");
    if (storedSchedule !== null) {
      const schedule = JSON.parse(storedSchedule);
      if (isType(schedule, Schedule)) {
        return schedule;
      }
    }

    const db = this.firestore;
    const schedulesRef = doc(db, "schedule", "today");
    const scheduleSnap = await getDoc(schedulesRef);
    const schedule = scheduleSnap.data();
    assertType(schedule, Schedule);

    sessionStorage.setItem("schedules", JSON.stringify(schedule));
    return schedule;
  }

  async fetchSchedules(): Promise<Schedule> {
    // Check cache first
    const storedSchedule = sessionStorage.getItem("schedules");
    if (storedSchedule !== null) {
      const schedule = JSON.parse(storedSchedule);
      if (isType(schedule, Schedule)) {
        return schedule;
      }
    }

    // Fetch from API if not in cache
    try {
      const response = await this.client.api.schedules.$get({});
      if (!response.ok) {
        throw new Error(`Failed to fetch schedules: ${response.statusText}`);
      }
      const schedule = await response.json();

      // Cache the result
      sessionStorage.setItem("schedules", JSON.stringify(schedule));
      return schedule;
    } catch (error) {
      console.error("Error fetching schedules:", error);
      throw error;
    }
  }

  async fetchTransactions(): Promise<TransactionsData> {
    const response = await this.client.api.transactions.$get({});
    if (!response.ok) {
      const errorCode = await extractErrorCode(response);
      throw new Error(errorCode);
    }
    return response.json();
  }

  async postTransactions(transactions: TransactionsData): Promise<PostTransactionsResult> {
    const response = await this.client.api.transactions.$post({
      json: transactions,
    });
    if (!response.ok) {
      const errorCode = await extractErrorCode(response);
      throw new Error(errorCode);
    }
    return response.json();
  }

  async sendFeedbackEmail(data: FeedbackData): Promise<boolean> {
    try {
      const response = await this.client.api.feedback.$post({
        json: data,
      });
      if (!response.ok) {
        throw new Error(`Failed to send feedback: ${response.statusText}`);
      }
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error("Error sending feedback:", error);
      throw error;
    }
  }

  async setLineupsBoolean(teamKey: string, value: boolean): Promise<void> {
    try {
      const response = await this.client.api.teams[":teamKey"].lineup.setting.$put({
        param: { teamKey },
        json: { value },
      });
      if (!response.ok) {
        throw new Error(`Failed to update lineup setting: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error setting lineups boolean:", error);
      throw error;
    }
  }

  async setPauseLineupActions(teamKey: string, value: boolean): Promise<void> {
    try {
      const response = await this.client.api.teams[":teamKey"].lineup.paused.$put({
        param: { teamKey },
        json: { value },
      });
      if (!response.ok) {
        throw new Error(`Failed to update lineup pause: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error setting pause lineup:", error);
      throw error;
    }
  }
}

const ErrorResponseBody = type({
  "code?": "string",
  "error?": "string",
  "message?": "string",
});

async function extractErrorCode(response: Response): Promise<string> {
  try {
    const json: unknown = await response.json();
    const result = ErrorResponseBody(json);
    if (result instanceof type.errors) {
      return response.statusText;
    }
    if (result.code) {
      return result.code;
    }
    if (result.error) {
      return result.error;
    }
    if (result.message) {
      return result.message;
    }
  } catch {
    // fall through to statusText
  }
  return response.statusText;
}
