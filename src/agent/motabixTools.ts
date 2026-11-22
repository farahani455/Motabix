import type { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Hard cap for agent loop steps (PLAN).
 * For local limit testing only, temporarily lower this (use at least 4).
 */
export const AGENT_MAX_STEPS = 20;

/** Max chars of run_command stdout/stderr returned to the model (PLAN). */
export const RUN_COMMAND_OUTPUT_TAIL = 2000;

export type MotabixToolName = 'read_file' | 'edit_file' | 'run_command';

export const MOTABIX_TOOL_NAMES: readonly MotabixToolName[] = [
    'read_file',
    'edit_file',
    'run_command'
] as const;

/**
 * OpenAI-compatible tool schemas for Motabix agent modes.
 * Real executors land in T6–T8; this file is the contract only (T5).
 */
export const MOTABIX_TOOLS: ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'read_file',
            description:
                'Read the full text of a file by path. You may call read_file many times in one agent turn (same step or across steps) to inspect multiple files. Path must be allowed by Settings path scope.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute or workspace-relative file path to read.'
                    }
                },
                required: ['path'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'edit_file',
            description:
                'Propose a full-file replacement for an existing or new file. At most one edit_file per agent step. User Accept/Reject applies the change (Diff UX).',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'Absolute or workspace-relative file path to edit or create.'
                    },
                    content: {
                        type: 'string',
                        description: 'Complete new file contents (no placeholders).'
                    }
                },
                required: ['path', 'content'],
                additionalProperties: false
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'run_command',
            description:
                'Run a shell command. Working directory comes from Settings. Approval may be required. Only the last 2000 characters of combined stdout/stderr are returned to the model.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'Shell command to execute.'
                    }
                },
                required: ['command'],
                additionalProperties: false
            }
        }
    }
];

export function isMotabixToolName(name: string): name is MotabixToolName {
    return (MOTABIX_TOOL_NAMES as readonly string[]).includes(name);
}
