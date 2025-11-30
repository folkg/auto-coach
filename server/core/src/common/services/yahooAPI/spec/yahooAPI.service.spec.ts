import type { AxiosError, AxiosResponse } from "axios";
import { parse } from "js2xmlparser";
import { describe, expect, it, vi } from "vitest";
import type { PlayerTransaction, TPlayer } from "@common/types/transactions.js";
import { createMock } from "@common/utilities/createMock";
import { postRosterAddDropTransaction } from "../yahooAPI.service.js";
import * as yahooHttpService from "../yahooHttp.service.js";

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: vi.fn(() => ({ settings: vi.fn() })),
}));

vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => ["null"]),
  initializeApp: vi.fn(),
}));

describe("YahooAPI Service", () => {
  it("should call API to drop players", async () => {
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff Barnes

    const expectedJSON = {
      transaction: {
        type: "drop",
        player: {
          player_key: "418.p.6047",
          transaction_data: {
            type: "drop",
            source_team_key: "418.l.201581.t.1",
          },
        },
      },
    };
    const expectedXML = parse("fantasy_content", expectedJSON);

    const transaction = createMock<PlayerTransaction>({
      sameDayTransactions: true,
      teamKey: "418.l.201581.t.1",
      reason: "",
      players: [
        createMock<TPlayer>({
          playerKey: "418.p.6047",
          transactionType: "drop",
          isInactiveList: false,
          isFromWaivers: false,
        }),
      ],
    });

    const spyHttpPostAxiosAuth = vi.spyOn(yahooHttpService, "httpPostAxiosAuth");
    spyHttpPostAxiosAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostAxiosAuth).toHaveBeenCalledWith(
      uid,
      "league/418.l.201581/transactions",
      expectedXML,
    );
  });

  it("should call API to add players", async () => {
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff Barnes

    const expectedJSON = {
      transaction: {
        type: "add",
        player: {
          player_key: "418.p.6047",
          transaction_data: {
            type: "add",
            destination_team_key: "418.l.201581.t.1",
          },
        },
      },
    };
    const expectedXML = parse("fantasy_content", expectedJSON);

    const transaction = createMock<PlayerTransaction>({
      sameDayTransactions: true,
      teamKey: "418.l.201581.t.1",
      reason: "",
      players: [
        createMock<TPlayer>({
          playerKey: "418.p.6047",
          transactionType: "add",
          isInactiveList: false,
          isFromWaivers: false,
        }),
      ],
    });

    const spyHttpPostAxiosAuth = vi.spyOn(yahooHttpService, "httpPostAxiosAuth");
    spyHttpPostAxiosAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostAxiosAuth).toHaveBeenCalledWith(
      uid,
      "league/418.l.201581/transactions",
      expectedXML,
    );
  });

  it("should call API to add players from waivers", async () => {
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff Barnes

    const expectedJSON = {
      transaction: {
        type: "add",
        faab_bid: 0,
        player: {
          player_key: "418.p.6047",
          transaction_data: {
            type: "add",
            destination_team_key: "418.l.201581.t.1",
          },
        },
      },
    };
    const expectedXML = parse("fantasy_content", expectedJSON);

    const transaction = createMock<PlayerTransaction>({
      sameDayTransactions: true,
      teamKey: "418.l.201581.t.1",
      reason: "",
      isFaabRequired: true,
      players: [
        createMock<TPlayer>({
          playerKey: "418.p.6047",
          transactionType: "add",
          isInactiveList: false,
          isFromWaivers: true,
        }),
      ],
    });

    const spyHttpPostAxiosAuth = vi.spyOn(yahooHttpService, "httpPostAxiosAuth");
    spyHttpPostAxiosAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostAxiosAuth).toHaveBeenCalledWith(
      uid,
      "league/418.l.201581/transactions",
      expectedXML,
    );
  });

  it("should call API to add/drop players", async () => {
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff Barnes

    const expectedJSON = {
      transaction: {
        type: "add/drop",
        players: {
          player: [
            {
              player_key: "418.p.6047",
              transaction_data: {
                type: "add",
                destination_team_key: "418.l.201581.t.1",
              },
            },
            {
              player_key: "418.p.6048",
              transaction_data: {
                type: "drop",
                source_team_key: "418.l.201581.t.1",
              },
            },
          ],
        },
      },
    };
    const expectedXML = parse("fantasy_content", expectedJSON);

    // drop and add are reversed to test that the order doesn't matter
    const transaction = createMock<PlayerTransaction>({
      sameDayTransactions: true,
      teamKey: "418.l.201581.t.1",
      reason: "",
      players: [
        createMock<TPlayer>({
          playerKey: "418.p.6048",
          transactionType: "drop",
          isInactiveList: false,
          isFromWaivers: false,
        }),
        createMock<TPlayer>({
          playerKey: "418.p.6047",
          transactionType: "add",
          isInactiveList: false,
          isFromWaivers: false,
        }),
      ],
    });

    const spyHttpPostAxiosAuth = vi.spyOn(yahooHttpService, "httpPostAxiosAuth");
    spyHttpPostAxiosAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostAxiosAuth).toHaveBeenCalledWith(
      uid,
      "league/418.l.201581/transactions",
      expectedXML,
    );
  });
  it("should swallow the error for picking up a player on waivers that we recently dropped", async () => {
    const axiosError = createMock<AxiosError>({
      isAxiosError: true,
      response: createMock<AxiosResponse>({
        data:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<error xml:lang="en-us" yahoo:uri="http://fantasysports.yahooapis.com/fantasy/v2/league/422.l.58716/transactions" xmlns:yahoo="http://www.yahooapis.com/v1/base.rng" xmlns="http://www.yahooapis.com/v1/base.rng">\n' +
          " <description>You cannot add a player you dropped until the waiver period ends.</description>\n" +
          " <detail/>\n" +
          "</error>",
      }),
    });
    const uid = "xAyXmaHKO3aRm9J3fnj2rgZRPnX2"; // Jeff Barnes
    const teamKey = "418.l.201581.t.1";
    const transaction = createMock<PlayerTransaction>({
      sameDayTransactions: true,
      teamKey: teamKey,
      reason: "",
      players: [
        createMock<TPlayer>({
          playerKey: "418.p.6048",
          transactionType: "drop",
          isInactiveList: false,
          isFromWaivers: false,
        }),
      ],
    });
    const errMessage = `There was a problem posting one transaction. Here are the error details: User: ${uid} Team: ${teamKey} Transaction: ${JSON.stringify(
      transaction,
    )}`;
    const spyHttpPostAxiosAuth = vi.spyOn(yahooHttpService, "httpPostAxiosAuth");
    spyHttpPostAxiosAuth.mockImplementation(() => {
      return Promise.reject(axiosError);
    });
    const spyConsoleError = vi.spyOn(console, "info");
    spyConsoleError.mockImplementation(() => {
      return;
    });
    const result = await postRosterAddDropTransaction(transaction, uid);
    expect(spyConsoleError).toHaveBeenCalledWith(
      `You cannot add a player you dropped until the waiver period ends. ${errMessage}`,
    );
    expect(result).toEqual(null);
  });
});
