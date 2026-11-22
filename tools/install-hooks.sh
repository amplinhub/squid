#!/bin/sh
# One-time setup on a new machine: every commit refreshes manifest.json automatically.
cd "$(dirname "$0")/.." || exit 1
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
sh tools/stamp.sh && git add manifest.json
EOF
chmod +x .git/hooks/pre-commit
echo "pre-commit hook installed"
