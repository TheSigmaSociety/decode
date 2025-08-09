// Simple test script to verify extension compilation
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking extension compilation...');

// Check if main files exist
const mainFile = path.join(__dirname, 'out', 'extension.js');
const packageFile = path.join(__dirname, 'package.json');

if (fs.existsSync(mainFile)) {
    console.log('✅ Main extension file compiled successfully');
} else {
    console.log('❌ Main extension file not found');
    process.exit(1);
}

if (fs.existsSync(packageFile)) {
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    console.log(`✅ Package.json valid - Extension: ${pkg.displayName} v${pkg.version}`);
} else {
    console.log('❌ Package.json not found');
    process.exit(1);
}

// Check if out directory has the expected structure
const outDir = path.join(__dirname, 'out');
if (fs.existsSync(outDir)) {
    const files = fs.readdirSync(outDir);
    console.log(`✅ Output directory contains ${files.length} compiled files`);
    console.log('📁 Compiled files:', files.slice(0, 5).join(', ') + (files.length > 5 ? '...' : ''));
} else {
    console.log('❌ Output directory not found');
    process.exit(1);
}

console.log('\n🎉 Extension compilation verification complete!');
console.log('\n📋 Next steps:');
console.log('1. Press F5 in VS Code to launch Extension Development Host');
console.log('2. Test the extension features in the new window');
console.log('3. Check the "Code Explanation" panel in the Explorer view');
console.log('4. Use Ctrl+Shift+E (Cmd+Shift+E on Mac) to explain selected code');