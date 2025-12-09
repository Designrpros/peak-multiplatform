#!/bin/bash
# Migration script for AIAssistant v2.0
# Moves old monolithic files to .old folder and activates new architecture

echo "🔄 Starting AIAssistant v2 migration..."

# Create .old directory
mkdir -p src/components/AIAssistant/.old

# Move old monolithic files
echo "📦 Moving old files to .old folder..."

mv src/components/AIAssistant/AIAssistantView.js src/components/AIAssistant/.old/ 2>/dev/null || echo "  ⚠️  AIAssistantView.js already moved or not found"
mv src/components/AIAssistant/ui/ChatView.js src/components/AIAssistant/.old/ 2>/dev/null || echo "  ⚠️  ChatView.js already moved or not found"
mv src/components/AIAssistant/ui/LayoutController.js src/components/AIAssistant/.old/ 2>/dev/null || echo "  ⚠️  LayoutController.js already moved or not found"
mv src/components/AIAssistant/core/MCPClient.js src/components/AIAssistant/.old/ 2>/dev/null || echo "  ⚠️  MCPClient.js already moved or not found"

# Move old card files (14 separate card classes)
if [ -d "src/components/AIAssistant/ui/cards" ]; then
    mv src/components/AIAssistant/ui/cards src/components/AIAssistant/.old/ 2>/dev/null && echo "  ✅ Moved cards directory"
else
    echo "  ⚠️  cards directory already moved or not found"
fi

# Backup and replace index.js
if [ -f "src/components/AIAssistant/index.js" ]; then
    mv src/components/AIAssistant/index.js src/components/AIAssistant/.old/index-original.js && echo "  ✅ Backed up original index.js"
else
    echo "  ⚠️  index.js already moved or not found"
fi

if [ -f "src/components/AIAssistant/index-new.js" ]; then
    mv src/components/AIAssistant/index-new.js src/components/AIAssistant/index.js && echo "  ✅ Activated new index.js"
else
    echo "  ⚠️  index-new.js not found"
fi

echo ""
echo "✨ Migration complete!"
echo ""
echo "📊 Summary:"
echo "  - Old files moved to: src/components/AIAssistant/.old/"
echo "  - New architecture activated"
echo ""
echo "🚀 Next steps:"
echo "  1. Restart your dev server (npm start)"
echo "  2. Open AI Assistant to test"
echo "  3. Check browser console: window.peakAI should be available"
echo ""
