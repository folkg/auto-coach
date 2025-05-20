import { Injectable, inject } from "@angular/core";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "@firebase/firestore";
import { httpsCallable, httpsCallableFromURL } from "@firebase/functions";
import { type } from "arktype";
import { HONO_CLIENT } from "../hono-client-config";
import { FIRESTORE, FUNCTIONS } from "../shared/firebase-tokens";
import { assertType, isType } from "../shared/utils/checks";
import { Schedule } from "../teams/interfaces/schedules";
import {
  PostTransactionsResult,
  TransactionsData,
} from "../transactions/interfaces/TransactionsData";
// biome-ignore lint/style/useImportType: This is an injection token
import { AuthService } from "./auth.service";
import { Team, TeamFirestore } from "./interfaces/team";

@Injectable({
  providedIn: "root",
})
export class APIService {
  private readonly client = inject(HONO_CLIENT);
  private readonly functions = inject(FUNCTIONS);
  private readonly firestore = inject(FIRESTORE);

  constructor(private readonly auth: AuthService) {}

  async fetchTeamsYahoo(): Promise<Team[]> {
    const fetchTeamsFromServer = httpsCallableFromURL(
      this.functions,
      "https://fantasyautocoach.com/api/fetchuserteams",
    );

    const aaa = await this.client.author.$post({
      json: { name: "me", age: 20 },
    });

    if (aaa.ok) {
      const result = await aaa.json();
      console.log("aaa", { result });
    }

    const result = await fetchTeamsFromServer();
    return Team.array().assert(result.data);
  }

  async fetchTeamsFirestore(): Promise<TeamFirestore[]> {
    const user = await this.auth.getUser();
    const db = this.firestore;

    // fetch teams for the current user and now < end_date
    const teamsRef = collection(db, "users", user.uid, "teams");
    const teamsSnapshot = await getDocs(
      query(teamsRef, where("end_date", ">=", Date.now())),
    );

    return teamsSnapshot.docs.map((doc) => {
      const team = doc.data();
      assertType(team, TeamFirestore);
      return team;
    });
  }

  async fetchSchedules(): Promise<Schedule> {
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

  async fetchTransactions(): Promise<TransactionsData> {
    const fetchTransactions = httpsCallableFromURL(
      this.functions,
      "https://fantasyautocoach.com/api/gettransactions",
    );

    const result = await fetchTransactions();
    return TransactionsData.assert(result.data);
  }

  async postTransactions(
    transactions: TransactionsData,
  ): Promise<PostTransactionsResult> {
    const postTransactions = httpsCallableFromURL<
      { transactions: TransactionsData },
      PostTransactionsResult
    >(this.functions, "https://fantasyautocoach.com/api/posttransactions");

    const result = await postTransactions({ transactions });
    return PostTransactionsResult.assert(result.data);
  }

  async sendFeedbackEmail(data: FeedbackData): Promise<boolean> {
    const sendFeedbackEmail = httpsCallable(
      this.functions,
      "sendfeedbackemail",
    );

    const result = await sendFeedbackEmail(data);
    return type("boolean").assert(result.data);
  }

  async setLineupsBoolean(teamKey: string, value: boolean): Promise<void> {
    const user = await this.auth.getUser();

    const db = this.firestore;

    const teamsRef = collection(db, "users", user.uid, "teams");
    const docRef = doc(teamsRef, teamKey);

    await updateDoc(docRef, { is_setting_lineups: value });
  }

  async setPauseLineupActions(teamKey: string, value: boolean): Promise<void> {
    const user = await this.auth.getUser();
    const db = this.firestore;

    const teamsRef = collection(db, "users", user.uid, "teams");
    const docRef = doc(teamsRef, teamKey);

    await updateDoc(docRef, {
      lineup_paused_at: value === true ? Date.now() : -1,
    });
  }
}

export type FeedbackData = {
  userEmail: string;
  feedbackType: string;
  title: string;
  message: string;
};
