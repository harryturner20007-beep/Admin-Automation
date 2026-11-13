import { beforeEach, describe, expect, it } from "vitest";
import { chatThreads, matchesSearch, searchText } from "@/domain/chats";
import type { AppState } from "@/domain/types";
import { buildSeedState, DEMO_GARAGE_ID } from "@/demo/seed";

let s: AppState;
beforeEach(async () => {
  s = await buildSeedState();
});

const find = (query: string) => chatThreads(s, DEMO_GARAGE_ID).filter((t) => matchesSearch(searchText(s, DEMO_GARAGE_ID, t.phone), query)).map((t) => t.name);

/** A customer who has a chat thread in the sample data. */
const who = () => {
  const t = chatThreads(s, DEMO_GARAGE_ID)[0];
  return s.quotes.find((q) => q.garageId === DEMO_GARAGE_ID && q.phone === t.phone)!;
};

describe("chat search", () => {
  it("finds a customer by name, number (any format), plate and quote ref", () => {
    const q = who();
    const local = `0${q.phone.slice(3, 7)} ${q.phone.slice(7)}`;
    expect(find(q.customerName.slice(0, 5).toLowerCase())).toContain(q.customerName);
    expect(find(local)).toContain(q.customerName);
    expect(find(q.phone)).toContain(q.customerName);
    expect(find(q.phone.slice(-6))).toContain(q.customerName);
    expect(find(q.sourceQuoteId.toLowerCase())).toContain(q.customerName);
    expect(q.registration).toBeTruthy();
    expect(find(q.registration!.replace(" ", "").toLowerCase())).toContain(q.customerName);
    expect(find(q.registration!.toLowerCase())).toContain(q.customerName);
  });

  it("finds by job description and by job or invoice number once they exist", () => {
    const q = who();
    expect(find(q.job.split(" ").slice(0, 2).join(" "))).toContain(q.customerName);
    s.jobs.push({ ...s.jobs[0], id: "jx", quoteId: q.id, number: "JOB-9999" });
    expect(find("job-9999")).toEqual([q.customerName]);
  });

  it("every word must match, and nonsense matches nobody; blank shows everyone", () => {
    expect(find(`${who().customerName.slice(0, 4)} zzzzz`)).toEqual([]);
    expect(find("   ").length).toBe(chatThreads(s, DEMO_GARAGE_ID).length);
  });
});
