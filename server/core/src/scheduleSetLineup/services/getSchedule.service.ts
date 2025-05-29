import type { Schedule } from "@common/types/schedule.js";
import { db } from "../../common/services/firebase/firestore.service.js";
import { getPacificTimeDateString } from "../../common/services/utilities.service.js";
import type { GameStartTimes } from "../interfaces/GameStartTimes.js";
import { getTodaysGames } from "./scheduling.service.js";

/**
 * Gets the current schedule data from Firestore
 *
 * @param uid - The user ID (not used but included for consistency)
 * @returns The schedule data
 */
export async function getSchedule(_uid: string): Promise<Schedule> {
  const todayDate: string = getPacificTimeDateString(new Date());

  // Fetch schedule data from Firestore
  const scheduleDoc = await db.collection("schedule").doc("today").get();
  const scheduleDocData = scheduleDoc.data();

  let gameStartTimes: GameStartTimes;
  let date: string;

  if (
    !(scheduleDoc.exists && scheduleDocData) ||
    scheduleDocData.date !== todayDate
  ) {
    // If no data exists or it's for a different date, fetch new data
    gameStartTimes = await getTodaysGames(todayDate);
    date = todayDate;
  } else {
    // Use existing data
    gameStartTimes = scheduleDocData.games;
    date = scheduleDocData.date;
  }

  // Return formatted schedule data
  return {
    date,
    games: gameStartTimes,
  };
}
