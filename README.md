# AI Code Explanation Extension

A VS Code extension that provides AI-powered code explanations using Google's Gemini API. This extension helps developers understand complex code by analyzing selected lines and providing plain English explanations of what the code does and how it works.

## Features

- 🎯 **Smart Code Selection**: Click on any line of code to automatically highlight related lines
- 🤖 **AI-Powered Explanations**: Get detailed explanations using Google's Gemini API
- 🔗 **Relationship Detection**: Automatically identifies variable declarations, function calls, and dependencies
- 📱 **Dedicated Sidebar**: Clean, dedicated panel for viewing explanations
- 📚 **Explanation History**: Keep track of previous explanations
- ⚡ **Real-time Analysis**: Instant feedback as you navigate through code
- 🎨 **Visual Highlighting**: Clear visual indicators for selected and related code lines

## Installation

1. Install the extension from the VS Code Marketplace
2. Get a free Gemini API key from [Google AI Studio](https://ai.google.dev/gemini-api/docs/api-key)
3. Configure your API key in the extension settings

## Quick Start

1. **Configure API Key**: 
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run "AI Code Explanation: Set Gemini API Key"
   - Enter your API key

2. **Explain Code**:
   - Click on any line of code in the editor
   - The extension will automatically highlight related lines
   - View the AI explanation in the sidebar panel

3. **Manual Explanation**:
   - Select code and press `Ctrl+Shift+E` (`Cmd+Shift+E` on Mac)
   - Or right-click and select "Explain Selected Code"

## Usage

### Automatic Mode
- Simply click on any line of code
- The extension automatically:
  - Highlights the selected line
  - Identifies and highlights related code lines
  - Generates an AI explanation
  - Displays the explanation in the sidebar

### Manual Mode
- Select specific code sections
- Use keyboard shortcuts or context menu
- Get targeted explanations for complex code blocks

### Keyboard Shortcuts
- `Ctrl+Shift+E` (`Cmd+Shift+E`): Explain selected code
- `Ctrl+Shift+H` (`Cmd+Shift+H`): Toggle code highlights

## Configuration

Access settings via `File > Preferences > Settings` and search for "AI Code Explanation":

- **API Key**: Your Gemini API key (required)
- **Model**: Gemini model to use (default: gemini-2.0-flash-001)
- **Temperature**: AI response creativity (0-1, default: 0.3)
- **Max Tokens**: Maximum response length (default: 1000)
- **Auto Explanation**: Enable automatic explanations on selection (default: true)
- **Debounce Delay**: Delay before processing selections (default: 500ms)

## Supported Languages

The extension works with all programming languages supported by VS Code, including:
- JavaScript/TypeScript
- Python
- Java
- C/C++
- C#
- Go
- Rust
- PHP
- Ruby
- And many more...

## How It Works

1. **Code Analysis**: When you select a line, the extension analyzes the code to identify:
   - Variable declarations and usages
   - Function calls and definitions
   - Control flow structures (if/else, loops)
   - Import dependencies
   - Class members and relationships

2. **Smart Highlighting**: Related lines are highlighted with different colors:
   - 🎯 **Selected Line**: Primary highlight with "Selected" indicator
   - 🔗 **Related Lines**: Secondary highlight with "Related" indicator

3. **AI Explanation**: The selected code and related context are sent to Gemini API for analysis, returning:
   - What the code does
   - How different parts work together
   - Important concepts and patterns
   - Potential side effects or behaviors

## Commands

- `AI Code Explanation: Set Gemini API Key` - Configure your API key
- `AI Code Explanation: Explain Selected Code` - Generate explanation for selection
- `AI Code Explanation: Toggle Code Highlights` - Show/hide code highlights
- `AI Code Explanation: Clear Code Highlights` - Remove all highlights
- `AI Code Explanation: Test Gemini API Connection` - Verify API connectivity
- `AI Code Explanation: Show Output` - View extension logs

## Troubleshooting

### API Key Issues
- Ensure your API key is valid and has Gemini API access
- Check the output panel for detailed error messages
- Test connection using "Test Gemini API Connection" command

### No Explanations Generated
- Verify your internet connection
- Check if the selected code is in a supported language
- Review API quota limits in Google AI Studio

### Performance Issues
- Adjust the debounce delay in settings
- Disable auto-explanation for large files
- Clear explanation history if it becomes too large

### Extension Not Working
- Restart VS Code
- Check the output panel for error messages
- Ensure the extension is enabled and up to date

## Privacy & Security

- Code snippets are sent to Google's Gemini API for analysis
- API keys are stored securely in VS Code's settings
- No code is stored permanently by the extension
- Review Google's privacy policy for Gemini API usage

## Contributing

This extension is open source. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Development

### Prerequisites
- Node.js 16+
- VS Code
- TypeScript

### Setup
```bash
git clone <repository-url>
cd ai-code-explanation-extension
npm install
```

### Building
```bash
npm run compile
```

### Testing
```bash
npm run test
```

### Packaging
```bash
npm run package
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### 0.0.1
- Initial release
- Basic code explanation functionality
- Gemini API integration
- Code highlighting and relationship detection
- Sidebar panel with explanation history

## Support

If you encounter issues or have suggestions:
1. Check the troubleshooting section above
2. Review existing issues on GitHub
3. Create a new issue with detailed information
4. Include extension logs from the output panel

## Acknowledgments

- Google Gemini API for AI-powered explanations
- VS Code Extension API for the development platform
- The open-source community for inspiration and feedback