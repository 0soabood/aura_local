/**
 * Custom error class for Veto approval interruptions
 * Used to signal the workflow that approval is needed
 */
export class VetoApprovalNeededError extends Error {
  public readonly action: any;
  
  constructor(action: any) {
    super(`Approval needed for action: ${action.toolName}`);
    this.name = 'VetoApprovalNeededError';
    this.action = action;
  }
}
