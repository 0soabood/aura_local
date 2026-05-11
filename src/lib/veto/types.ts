/**
 * Veto Layer - Tiered Authorization Model
 * 
 * Controls which actions require human approval before execution.
 * Three tiers: never (safe), always (dangerous), configurable (user choice)
 */

export type VetoTier = 'never' | 'always' | 'configurable';

export type VetoActionStatus = 'pending' | 'approved' | 'rejected' | 'modified';

export interface VetoAction {
  id: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  tier: VetoTier;
  status: VetoActionStatus;
  timestamp: number;
  description: string; // Human-readable description
  diff?: string; // For file changes
  workingDirectory?: string; // For shell commands
  estimatedCost?: number; // For API calls
  metadata?: Record<string, unknown>;
}

export interface VetoConfig {
  defaultBehavior: 'auto-approve' | 'require-approval';
  tierOverrides: Partial<Record<string, VetoTier>>;
  alwaysRequireFor: string[]; // Tool names that always require approval
  neverRequireFor: string[]; // Tool names that never require approval
}

export interface ApprovalRequest {
  action: VetoAction;
  sessionId: string;
  resumeCommand?: { resume: unknown }; // LangGraph Command for resumption
}

export interface ApprovalResponse {
  actionId: string;
  decision: 'approved' | 'rejected' | 'modified';
  modifiedArgs?: Record<string, unknown>;
  reviewerNotes?: string;
}

// Tool categorization based on risk/safety
export const TOOL_TIER_MAP: Record<string, VetoTier> = {
  // NEVER interrupt - safe read-only operations
  'read_file': 'never',
  'list_directory': 'never',
  'search_codebase': 'never',
  'get_file_skeleton': 'never',
  'write_memory': 'never', // Local memory is safe
  
  // ALWAYS interrupt - potentially dangerous operations
  'run_command': 'always', // Shell commands can be destructive
  'git_push': 'always', // Pushing to remote repos
  'delete_file': 'always', // Irreversible file deletion
  'modify_permissions': 'always', // Security-sensitive
  
  // CONFIGURABLE - user's choice
  'write_file': 'configurable', // File writes depend on context
  'edit_file': 'configurable', // Edits can be reviewed
  'create_etsy_listing': 'configurable', // Business operations
  'update_etsy_listing': 'configurable',
  'publish_to_printify': 'configurable',
  'api_call': 'configurable', // External API calls have costs
  'generate_document': 'configurable', // Document generation can be reviewed
};

export const DEFAULT_VETO_CONFIG: VetoConfig = {
  defaultBehavior: 'require-approval',
  tierOverrides: {},
  alwaysRequireFor: [],
  neverRequireFor: [],
};

/**
 * Determine the effective tier for a tool
 */
export function getToolTier(toolName: string, config: VetoConfig): VetoTier {
  // Check overrides first
  if (config.tierOverrides[toolName]) {
    return config.tierOverrides[toolName];
  }
  
  // Check explicit lists
  if (config.alwaysRequireFor.includes(toolName)) return 'always';
  if (config.neverRequireFor.includes(toolName)) return 'never';
  
  // Fall back to default map
  return TOOL_TIER_MAP[toolName] ?? 'configurable';
}

/**
 * Check if an action requires approval
 */
export function requiresApproval(
  toolName: string,
  config: VetoConfig,
  args?: Record<string, unknown>
): boolean {
  const tier = getToolTier(toolName, config);
  
  if (tier === 'never') return false;
  if (tier === 'always') return true;
  
  // Configurable - depends on default behavior
  return config.defaultBehavior === 'require-approval';
}

/**
 * Create a human-readable description for an action
 */
export function describeAction(
  toolName: string,
  args: Record<string, unknown>
): string {
  switch (toolName) {
    case 'read_file':
      return `Read file: ${args.filePath ?? args.path ?? 'unknown'}`;
    case 'write_file':
      return `Write file: ${args.filePath ?? args.path ?? 'unknown'} (${String(args.content).length} bytes)`;
    case 'edit_file':
      return `Edit file: ${args.filePath ?? args.path ?? 'unknown'}`;
    case 'run_command':
      return `Run command: ${args.command ?? 'unknown'} in ${args.cwd ?? 'current directory'}`;
    case 'delete_file':
      return `DELETE file: ${args.filePath ?? args.path ?? 'unknown'} (IRREVERSIBLE)`;
    case 'git_push':
      return `Git push to remote (publishes local commits)`;
    case 'create_etsy_listing':
      return `Create Etsy listing: ${args.title ?? 'untitled'} for $${args.price ?? '0'}`;
    case 'api_call':
      return `External API call: ${args.endpoint ?? 'unknown'} (may incur costs)`;
    default:
      return `${toolName}: ${JSON.stringify(args).slice(0, 100)}`;
  }
}

/**
 * Format shell command with working directory for display
 */
export function formatShellCommand(command: string, cwd?: string): string {
  if (cwd) {
    return `[${cwd}]$ ${command}`;
  }
  return `$ ${command}`;
}

/**
 * Generate a unified diff preview for file changes
 */
export function generateDiffPreview(
  filePath: string,
  oldContent: string,
  newContent: string
): string {
  // Simple line-by-line diff
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  let diff = `--- ${filePath}\n+++ ${filePath}\n`;
  
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine === undefined) {
      diff += `+ ${newLine}\n`;
    } else if (newLine === undefined) {
      diff += `- ${oldLine}\n`;
    } else if (oldLine !== newLine) {
      diff += `- ${oldLine}\n+ ${newLine}\n`;
    } else {
      diff += `  ${oldLine}\n`;
    }
  }
  
  return diff;
}
