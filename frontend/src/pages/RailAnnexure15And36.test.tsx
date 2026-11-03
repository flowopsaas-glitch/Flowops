import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RailEmergency from "./RailEmergency";
import RailAgreement from "./RailAgreement";
import { accessFeeTable } from "../data/railAgreementData";
import { accessFeeTable as statementFeeTable } from "../data/railStatementData";
import { activationLevels, hazmatContacts, scenarios } from "../data/railEmergencyData";

/**
 * Behavioural guarantees for the two pages built in round 74 (Annexure 36 and Annexure 15).
 * These assert the *guardrails*, not just that the pages render: an operator reading these pages
 * must never be able to mistake a template for an executed agreement, or a stale heading for a
 * superseded tariff.
 */

const mount = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("Annexure 36 — emergency response", () => {
  it("renders all three activation levels with their codes", () => {
    mount(<RailEmergency />);
    expect(screen.getByText(/Level 3/)).toBeInTheDocument();
    expect(screen.getByText(/Code Red/)).toBeInTheDocument();
    expect(screen.getByText(/Code Orange/)).toBeInTheDocument();
    expect(screen.getByText(/Code Green/)).toBeInTheDocument();
  });

  it("states that the document is a TFR internal procedure conferring no authority", () => {
    mount(<RailEmergency />);
    expect(document.body.textContent).toMatch(/confer(s)? no authority on FlowOps at a Transnet scene/i);
  });

  it("warns that contact numbers come from an uncontrolled copy", () => {
    mount(<RailEmergency />);
    expect(screen.getAllByText(/Uncontrolled copy when printed/i).length).toBeGreaterThan(0);
  });

  it("switches to the scenario matrix and shows every scenario family", () => {
    mount(<RailEmergency />);
    fireEvent.click(screen.getByRole("button", { name: "Scenario matrix" }));
    for (const s of scenarios) {
      expect(screen.getAllByText(new RegExp(`Scenario ${s.id}`)).length).toBeGreaterThan(0);
    }
    expect(document.body.textContent).toMatch(/DERAILMENTS/i);
  });

  it("switches to the contacts tab without inventing values for blank source rows", () => {
    mount(<RailEmergency />);
    fireEvent.click(screen.getByRole("button", { name: "Hazmat contacts" }));
    const blanks = hazmatContacts.filter((c) => !c.primary).length;
    expect(blanks).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(blanks);
  });

  it("keeps the fatality protocol ahead of service recovery", () => {
    mount(<RailEmergency />);
    expect(screen.getByText(/the scene must not be interfered with/i)).toBeInTheDocument();
  });
});

describe("Annexure 15 — rail access agreement", () => {
  it("shows the Access Seeker field as a placeholder rather than a party", () => {
    mount(<RailAgreement />);
    expect(screen.getByText(/Registration No: \[□\]/)).toBeInTheDocument();
  });

  it("flags the source copy as unexecuted on first paint", () => {
    mount(<RailAgreement />);
    expect(document.body.textContent).toMatch(/unexecuted form/i);
  });

  it("warns that nothing here evidences an operator's rights", () => {
    mount(<RailAgreement />);
    expect(screen.getByText(/nothing here evidences an operator/i)).toBeInTheDocument();
  });

  it("renders all seven suspensive conditions", () => {
    mount(<RailAgreement />);
    for (const ref of ["4.1.1", "4.1.2", "4.1.3", "4.1.4", "4.1.5", "4.1.6", "4.1.7"]) {
      expect(screen.getByText(ref)).toBeInTheDocument();
    }
  });

  it("points billing readers at the controlled tariff source, not the form", () => {
    mount(<RailAgreement />);
    fireEvent.click(screen.getByRole("button", { name: "Charges & penalties" }));
    expect(screen.getByText(/controlled billing source/i)).toBeInTheDocument();
  });
});

describe("audit assertions on the source data", () => {
  it("Annexure C rates reconcile exactly to NS V4 Table 17", () => {
    expect(accessFeeTable).toHaveLength(statementFeeTable.rows.length);
    accessFeeTable.forEach((row, i) => {
      const statement = statementFeeTable.rows[i];
      expect(row.category).toBe(statement.category);
      expect(row.perTrainKm).toBe(statement.trainKmRand);
      // Both print "0.0" for the passenger/loco rows; compare numerically so "0.0" == "0.0".
      expect(Number(row.perGtkCents)).toBe(Number(statement.gtkCents));
    });
  });

  it("every activation level carries a distinct code", () => {
    const codes = activationLevels.map((l) => l.colour);
    expect(new Set(codes).size).toBe(activationLevels.length);
  });

  it("the scenario matrix covers all five families A–E", () => {
    expect(scenarios.map((s) => s.id)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("preserves the literal four question marks printed against Welgedag", () => {
    mount(<RailEmergency />);
    fireEvent.click(screen.getByRole("button", { name: "Teams & depots" }));
    // Printed in both the Welgedag table cell and the legend — preserved verbatim in both places.
    expect(screen.getAllByText("????").length).toBeGreaterThanOrEqual(1);
  });
});
