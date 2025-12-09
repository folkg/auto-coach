import type { FeedbackData } from "@common/types/feedback";
import type { ClientTeam, FirestoreTeam } from "@common/types/team";
import type { PostTransactionsResult, TransactionsData } from "@common/types/transactions";

import { Injectable, inject } from "@angular/core";
import { Schedule } from "@common/types/Schedule";
import { isType } from "@common/utilities/checks";
import { type } from "arktype";

import { HONO_CLIENT } from "../hono-client-config";

@Injectable({
  providedIn: "root",
})
export class APIService {
  private readonly client = inject(HONO_CLIENT);

  async fetchTeams(): Promise<ClientTeam[]> {
    const response = await this.client.api.teams.$get({});
    if (!response.ok) {
      const errorCode = await extractErrorCode(response);
      throw new Error(errorCode);
    }
    return response.json();
  }

  async fetchTeamsPartial(): Promise<FirestoreTeam[]> {
    const response = await this.client.api.teams.partial.$get({});
    if (!response.ok) {
      const errorCode = await extractErrorCode(response);
      throw new Error(errorCode);
    }
    return response.json();
  }

  async fetchSchedules(): Promise<Schedule> {
    const storedSchedule = sessionStorage.getItem("schedules");
    if (storedSchedule !== null) {
      const schedule = JSON.parse(storedSchedule);
      if (isType(schedule, Schedule)) {
        return schedule;
      }
    }

    const response = await this.client.api.schedules.$get({});
    if (!response.ok) {
      throw new Error(`Failed to fetch schedules: ${response.statusText}`);
    }
    const schedule = await response.json();

    sessionStorage.setItem("schedules", JSON.stringify(schedule));
    return schedule;
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
    const response = await this.client.api.feedback.$post({
      json: data,
    });
    if (!response.ok) {
      throw new Error(`Failed to send feedback: ${response.statusText}`);
    }
    const result = await response.json();
    return result.success;
  }

  async setLineupsBoolean(teamKey: string, value: boolean): Promise<void> {
    const response = await this.client.api.teams[":teamKey"].lineup.setting.$put({
      param: { teamKey },
      json: { value },
    });
    if (!response.ok) {
      throw new Error(`Failed to update lineup setting: ${response.statusText}`);
    }
  }

  async setPauseLineupActions(teamKey: string, value: boolean): Promise<void> {
    const response = await this.client.api.teams[":teamKey"].lineup.paused.$put({
      param: { teamKey },
      json: { value },
    });
    if (!response.ok) {
      throw new Error(`Failed to update lineup pause: ${response.statusText}`);
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
