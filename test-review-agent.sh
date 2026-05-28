#!/bin/bash

# Test Review Agent

echo "==================================="
echo "Testing Review Agent"
echo "==================================="
echo ""

# First, ensure the project is indexed
echo "Step 1: Indexing the project..."
npm run cli index
echo ""

# Test Review Agent with the test file
echo "Step 2: Running Review Agent on test-review.ts..."
echo ""
npm run cli run "Review the code in test-review.ts and identify all security, performance, and quality issues" --agent review

echo ""
echo "==================================="
echo "Review Agent Test Complete"
echo "==================================="
