import { MotabixSettingsService } from '../services/MotabixSettingsService';
import { isEditAutomatically } from '../utils/isAskMode';
import { isMotabixToolName } from './motabixTools';
import { sanitizeEditFileArgs } from './sanitizeEditFileArgs';
import { executeReadFile } from './tools/readFileTool';
import { executeEditFile } from './tools/editFileTool';
import { EditProposalStore } from './EditProposalStore';

export type ToolExecuteContext = {
    agentMode?: string;
};

/** Dispatches agent tools. read_file + edit_file(diff) are live; run_command stays stub until T8. */
export class ToolExecutor {
    constructor(
        private readonly settingsService: MotabixSettingsService,
        private readonly proposalStore: EditProposalStore
    ) {}

    async execute(
        name: string,
        rawArguments: string,
        context: ToolExecuteContext = {}
    ): Promise<string> {
        let args: Record<string, unknown> = {};
        try {
            args = rawArguments?.trim() ? JSON.parse(rawArguments) : {};
        } catch {
            args = { raw: rawArguments };
        }

        if (!isMotabixToolName(name)) {
            return JSON.stringify({
                ok: false,
                tool: name,
                error: `Unknown tool "${name}". Supported: read_file, edit_file, run_command.`
            });
        }

        const settings = await this.settingsService.getSettings();

        if (name === 'read_file') {
            return executeReadFile(
                { path: typeof args.path === 'string' ? args.path : undefined },
                settings
            );
        }

        if (name === 'edit_file') {
            const autoApply = isEditAutomatically(context.agentMode);
            const cleaned = sanitizeEditFileArgs({
                path: typeof args.path === 'string' ? args.path : undefined,
                content: typeof args.content === 'string' ? args.content : undefined,
                raw: typeof args.raw === 'string' ? args.raw : undefined
            });
            console.log(
                `[Motabix][edit_file] dispatch agentMode=${JSON.stringify(context.agentMode)} ` +
                    `autoApply=${autoApply} path=${JSON.stringify(cleaned.path)} ` +
                    `contentLength=${cleaned.content?.length ?? 0}`
            );
            return executeEditFile(cleaned, settings, this.proposalStore, { autoApply });
        }

        return JSON.stringify({
            ok: true,
            stub: true,
            tool: name,
            args,
            message: `Stub run_command — real shell in T8. Requested: ${JSON.stringify(args)}`
        });
    }
}
