// Mock implementation of VS Code API for testing

export const window = {
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn()
    })),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showInputBox: jest.fn(),
    createTextEditorDecorationType: jest.fn(() => ({
        dispose: jest.fn()
    })),
    registerWebviewViewProvider: jest.fn(() => ({
        dispose: jest.fn()
    })),
    onDidChangeVisibleTextEditors: jest.fn(() => ({
        dispose: jest.fn()
    })),
    onDidChangeTextEditorSelection: jest.fn(() => ({
        dispose: jest.fn()
    })),
    onDidChangeActiveTextEditor: jest.fn(() => ({
        dispose: jest.fn()
    })),
    activeTextEditor: undefined
};

export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn(),
        has: jest.fn(),
        inspect: jest.fn()
    })),
    onDidChangeConfiguration: jest.fn(() => ({
        dispose: jest.fn()
    })),
    onDidChangeTextDocument: jest.fn(() => ({
        dispose: jest.fn()
    }))
};

export const commands = {
    registerCommand: jest.fn(() => ({
        dispose: jest.fn()
    })),
    executeCommand: jest.fn()
};

export const env = {
    clipboard: {
        writeText: jest.fn()
    },
    openExternal: jest.fn()
};

export class Uri {
    static file(path: string) {
        return { fsPath: path, toString: () => path };
    }
    
    static parse(uri: string) {
        return { toString: () => uri };
    }
    
    static joinPath(base: any, ...paths: string[]) {
        return { toString: () => `${base}/${paths.join('/')}` };
    }
}

export class Range {
    constructor(
        public start: Position,
        public end: Position
    ) {}
}

export class Position {
    constructor(
        public line: number,
        public character: number
    ) {}
}

export class Selection extends Range {
    constructor(
        startLine: number,
        startCharacter: number,
        endLine: number,
        endCharacter: number
    ) {
        super(
            new Position(startLine, startCharacter),
            new Position(endLine, endCharacter)
        );
    }
    
    get isEmpty() {
        return this.start.line === this.end.line && 
               this.start.character === this.end.character;
    }
}

export class ThemeColor {
    constructor(public id: string) {}
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
}

export enum ExtensionMode {
    Production = 1,
    Development = 2,
    Test = 3
}

export enum TextEditorRevealType {
    Default = 0,
    InCenter = 1,
    InCenterIfOutsideViewport = 2,
    AtTop = 3
}

export enum TextEditorSelectionChangeKind {
    Keyboard = 1,
    Mouse = 2,
    Command = 3
}

export enum OverviewRulerLane {
    Left = 1,
    Center = 2,
    Right = 4,
    Full = 7
}

export enum EndOfLine {
    LF = 1,
    CRLF = 2
}

// Mock extension context
export const mockExtensionContext = {
    subscriptions: [],
    workspaceState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => [])
    },
    globalState: {
        get: jest.fn(),
        update: jest.fn(),
        keys: jest.fn(() => []),
        setKeysForSync: jest.fn()
    },
    extensionUri: Uri.file(''),
    extensionPath: '',
    environmentVariableCollection: {},
    asAbsolutePath: (relativePath: string) => relativePath,
    storageUri: undefined,
    storagePath: undefined,
    globalStorageUri: Uri.file(''),
    globalStoragePath: '',
    logUri: Uri.file(''),
    logPath: '',
    extensionMode: ExtensionMode.Test,
    secrets: {}
};