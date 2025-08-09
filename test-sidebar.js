// Test script to verify sidebar configuration
const fs = require('fs');
const path = require('path');

console.log('🔍 Debugging sidebar configuration...\n');

const packageFile = path.join(__dirname, 'package.json');
if (fs.existsSync(packageFile)) {
    const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    
    console.log('📦 Package.json analysis:');
    
    // Check activation events
    if (pkg.activationEvents) {
        console.log('✅ Activation events:', pkg.activationEvents);
    } else {
        console.log('❌ No activation events found');
    }
    
    // Check viewsContainers
    if (pkg.contributes && pkg.contributes.viewsContainers && pkg.contributes.viewsContainers.activitybar) {
        const container = pkg.contributes.viewsContainers.activitybar[0];
        console.log('✅ Activity bar container:');
        console.log(`   ID: ${container.id}`);
        console.log(`   Title: ${container.title}`);
        console.log(`   Icon: ${container.icon}`);
    } else {
        console.log('❌ No activity bar container found');
    }
    
    // Check views
    if (pkg.contributes && pkg.contributes.views) {
        const viewContainerName = Object.keys(pkg.contributes.views)[0];
        const view = pkg.contributes.views[viewContainerName][0];
        console.log('✅ View configuration:');
        console.log(`   Container: ${viewContainerName}`);
        console.log(`   View ID: ${view.id}`);
        console.log(`   View Name: ${view.name}`);
        console.log(`   View Type: ${view.type}`);
        
        // Check if container ID matches view container
        if (pkg.contributes.viewsContainers && pkg.contributes.viewsContainers.activitybar) {
            const containerId = pkg.contributes.viewsContainers.activitybar[0].id;
            if (containerId === viewContainerName) {
                console.log('✅ Container ID matches view container name');
            } else {
                console.log(`❌ Container ID mismatch: ${containerId} vs ${viewContainerName}`);
            }
        }
    } else {
        console.log('❌ No views found');
    }
    
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Press F5 to launch Extension Development Host');
    console.log('2. Check the Output panel > "AI Code Explanation" for logs');
    console.log('3. Look for the comment-discussion icon in the Activity Bar');
    console.log('4. If not visible, try reloading the Extension Development Host window');
    console.log('5. Check VS Code Developer Tools (Help > Toggle Developer Tools) for errors');
    
} else {
    console.log('❌ Package.json not found');
}

// Check if extension.ts exists and has proper registration
const extensionFile = path.join(__dirname, 'src', 'extension.ts');
if (fs.existsSync(extensionFile)) {
    const content = fs.readFileSync(extensionFile, 'utf8');
    
    if (content.includes('registerWebviewViewProvider')) {
        console.log('✅ Webview provider registration found');
    } else {
        console.log('❌ Webview provider registration not found');
    }
    
    if (content.includes('CodeExplanationWebview.viewType')) {
        console.log('✅ ViewType reference found');
    } else {
        console.log('❌ ViewType reference not found');
    }
} else {
    console.log('❌ Extension.ts not found');
}