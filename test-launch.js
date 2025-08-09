// Test script to verify VS Code extension launch setup
const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying VS Code extension launch setup...\n');

// Check if compiled files exist
const outDir = path.join(__dirname, 'out');
const extensionFile = path.join(outDir, 'extension.js');

if (!fs.existsSync(outDir)) {
    console.log('❌ Output directory "out" not found');
    console.log('💡 Run: pnpm run compile');
    process.exit(1);
}

if (!fs.existsSync(extensionFile)) {
    console.log('❌ Main extension file not found');
    console.log('💡 Run: pnpm run compile');
    process.exit(1);
}

console.log('✅ Output directory exists');
console.log('✅ Main extension file compiled');

// Check launch configuration (skip JSON parsing due to comments)
const launchConfig = path.join(__dirname, '.vscode', 'launch.json');
if (fs.existsSync(launchConfig)) {
    const configContent = fs.readFileSync(launchConfig, 'utf8');
    if (configContent.includes('Run Extension') && configContent.includes('out/**/*.js')) {
        console.log('✅ Launch configuration found and properly configured');
    } else {
        console.log('⚠️  Launch configuration exists but may need adjustment');
    }
} else {
    console.log('❌ Launch configuration not found');
}

// Check tasks configuration
const tasksConfig = path.join(__dirname, '.vscode', 'tasks.json');
if (fs.existsSync(tasksConfig)) {
    console.log('✅ Tasks configuration found');
} else {
    console.log('❌ Tasks configuration not found');
}

// Check package.json scripts
const packageFile = path.join(__dirname, 'package.json');
if (fs.existsSync(packageFile)) {
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    if (pkg.scripts && pkg.scripts.compile && pkg.scripts.watch) {
        console.log('✅ Required npm scripts found');
    } else {
        console.log('❌ Missing required npm scripts');
    }
}

console.log('\n🎉 Launch setup verification complete!');
console.log('\n📋 To test your extension:');
console.log('1. Press F5 in VS Code');
console.log('2. Or use "Run > Start Debugging" from the menu');
console.log('3. A new "Extension Development Host" window should open');
console.log('4. Your extension will be loaded in that window');
console.log('\n🔧 If you see any errors, check the Debug Console in VS Code');