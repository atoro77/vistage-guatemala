# Vistage Guatemala — Setup Script
# Run this once after cloning / downloading the project
# Requires Node.js 18+ installed: https://nodejs.org

Write-Host "=== Vistage Guatemala Setup ===" -ForegroundColor Cyan

# Check Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "Download and install from: https://nodejs.org (LTS version)" -ForegroundColor Yellow
    exit 1
}

Write-Host "Node.js found: $(node --version)" -ForegroundColor Green

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Cyan
npm install

# Create .env if it doesn't exist
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "Created .env file. Please edit it and add your API keys:" -ForegroundColor Yellow
    Write-Host "  TAVILY_API_KEY   -> https://app.tavily.com" -ForegroundColor White
    Write-Host "  ANTHROPIC_API_KEY -> https://console.anthropic.com" -ForegroundColor White
    Write-Host ""
    Write-Host "Then run: npm start" -ForegroundColor Green
} else {
    Write-Host ".env already exists." -ForegroundColor Green
    Write-Host "Run: npm start" -ForegroundColor Green
}
