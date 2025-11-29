import type { FeedbackData } from "@common/types/feedback";
import type { ClientTeam, FirestoreTeam } from "@common/types/team";
import type { PostTransactionsResult, TransactionsData } from "@common/types/transactions";
import { Injectable, inject } from "@angular/core";
import { Schedule } from "@common/types/Schedule";
import { isType } from "@common/utilities/checks";
import { HONO_CLIENT } from "../hono-client-config";

@Injectable({
  providedIn: "root",
})
export class APIService {
  private readonly client = inject(HONO_CLIENT);

  async fetchTeamsYahoo(): Promise<ClientTeam[]> {
    try {
      const response = await this.client.api.teams.$get({});
      if (!response.ok) {
        throw new Error(`Failed to fetch teams: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error("Error fetching Yahoo teams:", error);
      throw error;
    }
  }

  async fetchTeamsPartial(): Promise<FirestoreTeam[]> {
    try {
      const response = await this.client.api.teams.partial.$get({});
      if (!response.ok) {
        throw new Error(`Failed to fetch teams: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error("Error fetching partial teams:", error);
      throw error;
    }
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
    try {
      const response = await this.client.api.transactions.$get({});
      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error("Error fetching transactions:", error);
      throw error;
    }
  }

  async postTransactions(transactions: TransactionsData): Promise<PostTransactionsResult> {
    try {
      const response = await this.client.api.transactions.$post({
        json: transactions,
      });
      if (!response.ok) {
        throw new Error(`Failed to post transactions: ${response.statusText}`);
      }
      return response.json();
    } catch (error) {
      console.error("Error posting transactions:", error);
      throw error;
    }
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
