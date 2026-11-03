import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RailCancellation from "./RailCancellation";
import RailOccurrence from "./RailOccurrence";
import RailAccess from "./RailAccess";
import RailTariffs from "./RailTariffs";
import RailStatement from "./RailStatement";
import RailCapacity from "./RailCapacity";
import RailInvestment from "./RailInvestment";
import RailKpis from "./RailKpis";
import RailRegister from "./RailRegister";
import RailSources from "./RailSources";
import RailEmergency from "./RailEmergency";
import RailAgreement from "./RailAgreement";
import RailCoverage from "./RailCoverage";

const mount = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
const referencePages = [
  { name: "Access & disputes", Page: RailAccess },
  { name: "Cancellations", Page: RailCancellation },
  { name: "Slots & capacity", Page: RailCapacity },
  { name: "Investment plan", Page: RailInvestment },
  { name: "Corridor KPIs", Page: RailKpis },
  { name: "Occurrence & policy", Page: RailOccurrence },
  { name: "Network register", Page: RailRegister },
  { name: "Network sources", Page: RailSources },
  { name: "Network statement", Page: RailStatement },
  { name: "Tariffs & charges", Page: RailTariffs },
  { name: "Emergency response", Page: RailEmergency },
  { name: "Access agreement", Page: RailAgreement },
  { name: "Coverage & gaps", Page: RailCoverage },
];

afterEach(cleanup);

describe("read-only rail reference controls", () => {
  it.each(referencePages)("identifies $name as read-only source material", ({ Page }) => {
    mount(<Page />);
    expect(screen.getByRole("note", { name: "Reference material" })).toHaveTextContent(/Reference view · read-only/i);
    expect(screen.getByRole("note", { name: "Reference material" })).toHaveTextContent(/do not submit requests or update rail records/i);
  });

  it("shows accessible active state and an explicit no-results message for cancellation filters", () => {
    mount(<RailCancellation />);
    const filters = screen.getByRole("group", { name: /Filter cancellation reasons/i });
    const allParties = screen.getByRole("button", { name: "All parties" });
    expect(allParties).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Force Majeure" }));
    expect(screen.getByRole("button", { name: "Force Majeure" })).toHaveAttribute("aria-pressed", "true");
    expect(filters).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search cancellation reasons" }), { target: { value: "zz-no-such-reason-zz" } });
    expect(screen.getByRole("status")).toHaveTextContent(/No cancellation reasons match/i);
  });

  it("shows an explicit no-results message for occurrence searches", () => {
    mount(<RailOccurrence />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search occurrence items" }), { target: { value: "zz-no-such-occurrence-zz" } });
    expect(screen.getByRole("status")).toHaveTextContent(/No occurrence categories match/i);
  });

  it("uses client-side routing for internal Rail links", () => {
    mount(<RailStatement />);
    expect(screen.getByRole("link", { name: /Tariffs & charges/i })).toHaveAttribute("href", "/rail/tariffs");
    cleanup();
    mount(<RailTariffs />);
    expect(screen.getByRole("link", { name: /Corridor KPIs/i })).toHaveAttribute("href", "/rail/kpis");
  });
});
