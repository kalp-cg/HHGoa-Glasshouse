import { describe, expect, it } from "vitest";
import type { ProfileFacts } from "@glasshouse/engine";
import { alertText, chatsFrom, leakKeys } from "../_lib/alerts";
import openFacts from "../../../../../fixtures/profile.open.json";

const facts = openFacts as ProfileFacts;

describe("alerts helpers", () => {
  it("chatsFrom reads chats out of a getUpdates-style result, deduped", () => {
    const result = { ok: true, result: [
      { update_id: 1, message: { chat: { id: 111, first_name: "Kalp", type: "private" }, text: "hi" } },
      { update_id: 2, message: { chat: { id: 111, first_name: "Kalp", type: "private" }, text: "again" } },
      { update_id: 3, message: { chat: { id: -200, title: "Team", type: "group" } } },
    ] };
    expect(chatsFrom(result)).toEqual([{ value: "111", label: "Kalp" }, { value: "-200", label: "Team" }]);
    expect(chatsFrom({ ok: true, result: [] })).toEqual([]);
  });

  it("chatsFrom reads the real list-messages answer (a bare array of Telegram updates; seen on a real connection)", () => {
    const real = [
      { update_id: 1, message: { message_id: 1, from: { id: 111, is_bot: false, first_name: "Ada", username: "ada" }, chat: { id: 111, first_name: "Ada", last_name: "L", username: "ada", type: "private" }, text: "/start" } },
      { update_id: 2, message: { message_id: 2, from: { id: 111, is_bot: false, first_name: "Ada" }, chat: { id: 111, first_name: "Ada", last_name: "L", username: "ada", type: "private" }, text: "hiii" } },
    ];
    expect(chatsFrom(real)).toEqual([{ value: "111", label: "Ada L" }]);
    expect(chatsFrom({ message: "No messages found in your telegram bot" })).toEqual([]);
  });

  it("leak keys: the time zone and each signal", () => {
    expect(leakKeys(facts)).toEqual(["tz:UTC+05:30", "signal:Travel", "signal:Career", "signal:Health", "signal:Finance", "signal:Legal"]);
  });

  it("alert text names only the new leaks and never an address", () => {
    const text = alertText(facts, ["signal:Health"]);
    expect(text).toContain("238 of your agent's payments");
    expect(text).toContain("Researching a health problem");
    expect(text).not.toContain("UTC+05:30");
    expect(text).not.toMatch(/0x[0-9a-f]{8}/);
  });
});
