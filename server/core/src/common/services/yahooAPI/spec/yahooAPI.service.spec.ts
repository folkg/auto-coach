import type { PlayerTransaction, TPlayer } from "@common/types/transactions.js";

import { createMock } from "@common/utilities/createMock";
import { parse } from "js2xmlparser";
import { describe, expect, it, vi } from "vitest";

import { postRosterAddDropTransaction } from "../yahooAPI.service.js";
import { HttpError } from "../yahooHttp.service.js";
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

    const spyHttpPostYahooAuth = vi.spyOn(yahooHttpService, "httpPostYahooAuthXml");
    spyHttpPostYahooAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostYahooAuth).toHaveBeenCalledWith(
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

    const spyHttpPostYahooAuth = vi.spyOn(yahooHttpService, "httpPostYahooAuthXml");
    spyHttpPostYahooAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostYahooAuth).toHaveBeenCalledWith(
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

    const spyHttpPostYahooAuth = vi.spyOn(yahooHttpService, "httpPostYahooAuthXml");
    spyHttpPostYahooAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostYahooAuth).toHaveBeenCalledWith(
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

    const spyHttpPostYahooAuth = vi.spyOn(yahooHttpService, "httpPostYahooAuthXml");
    spyHttpPostYahooAuth.mockImplementation(
      createMock(() => {
        return Promise.resolve();
      }),
    );

    await postRosterAddDropTransaction(transaction, uid);
    expect(spyHttpPostYahooAuth).toHaveBeenCalledWith(
      uid,
      "league/418.l.201581/transactions",
      expectedXML,
    );
  });
  it("swallows the error for picking up a player on waivers that we recently dropped", async () => {
    const httpError = new HttpError("HTTP 400: Bad Request", {
      data:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<error xml:lang="en-us" yahoo:uri="http://fantasysports.yahooapis.com/fantasy/v2/league/422.l.58716/transactions" xmlns:yahoo="http://www.yahooapis.com/v1/base.rng" xmlns="http://www.yahooapis.com/v1/base.rng">\n' +
        " <description>You cannot add a player you dropped until the waiver period ends.</description>\n" +
        " <detail/>\n" +
        "</error>",
      status: 400,
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
    const spyHttpPostYahooAuth = vi.spyOn(yahooHttpService, "httpPostYahooAuthXml");
    spyHttpPostYahooAuth.mockImplementation(() => {
      return Promise.reject(httpError);
    });

    // Arrange
    const spyStdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    // Act
    const result = await postRosterAddDropTransaction(transaction, uid);

    // Assert
    expect(result).toEqual(null);
    expect(spyStdout).toHaveBeenCalledWith(
      expect.stringContaining("Transaction blocked - waiver period not ended"),
    );

    spyStdout.mockRestore();
  });
});
