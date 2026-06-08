import * as vscode from 'vscode';


export function registerOpenInRightSidebarCommand(): vscode.Disposable {

    const openInRightSidebar = vscode.commands.registerCommand(
        'motabix.openInRightSidebar',
        async () => {
            await vscode.commands.executeCommand('workbench.action.toggleAuxiliaryBar');
            await vscode.commands.executeCommand('motabix.chatView.focus');
            vscode.window.showInformationMessage(
                'If Motabix is not on the right yet, right-click the view title and choose Move View -> Secondary Side Bar.'
            );
        }
    );
    return openInRightSidebar;
}