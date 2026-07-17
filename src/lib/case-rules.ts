import type { CaseStatus } from "@prisma/client";

export const caseTransitions: Record<CaseStatus, CaseStatus[]> = {
  SUBMITTED: ["IN_PROGRESS", "CANCELED"],
  IN_PROGRESS: ["COMPLETED", "CANCELED"],
  CANCELED: [],
  COMPLETED: [],
};

export function canTransitionCase(from: CaseStatus, to: CaseStatus): boolean {
  return caseTransitions[from].includes(to);
}

export function canEditCaseDetails(status: CaseStatus): boolean {
  return status === "IN_PROGRESS";
}

export function ownsCase(ownerUserId: string, currentUserId: string): boolean {
  return ownerUserId === currentUserId;
}
