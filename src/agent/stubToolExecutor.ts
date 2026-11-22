import { isMotabixToolName, MotabixToolName } from './motabixTools';

export type StubToolResult = {
    ok: boolean;
    stub: true;
    tool: MotabixToolName | string;
    args: unknown;
    message: string;
};

/** Placeholder executors until T6–T8. Lets the agent loop run end-to-end. */
export async function executeStubTool(
    name: string,
    rawArguments: string
): Promise<string> {
    let args: unknown = {};
    try {
        args = rawArguments?.trim() ? JSON.parse(rawArguments) : {};
    } catch {
        args = { raw: rawArguments };
    }

    if (!isMotabixToolName(name)) {
        const result: StubToolResult = {
            ok: false,
            stub: true,
            tool: name,
            args,
            message: `Unknown tool "${name}". Supported: read_file, edit_file, run_command.`
        };
        return JSON.stringify(result);
    }

    const result: StubToolResult = {
        ok: true,
        stub: true,
        tool: name,
        args,
        message: stubMessage(name, args)
    };
    return JSON.stringify(result);
}

function stubMessage(name: MotabixToolName, args: unknown): string {
    switch (name) {
        case 'read_file':
            return `Stub read_file — real file IO in T6. Requested: ${JSON.stringify(args)}`;
        case 'edit_file':
            return `Stub edit_file — real Diff/Accept in T7. Requested: ${JSON.stringify(args)}`;
        case 'run_command':
            return `Stub run_command — real shell in T8. Requested: ${JSON.stringify(args)}`;
    }
}
