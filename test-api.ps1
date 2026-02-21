# Test API calls for Medic Companion

$baseUrl = "http://localhost:3000/api"
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$testEmail = "test$timestamp@test.com"

Write-Host "=== Testing Health Endpoint ===" -ForegroundColor Cyan
$health = Invoke-RestMethod -Uri "$baseUrl/health"
$health | ConvertTo-Json

Write-Host "`n=== Testing Register ===" -ForegroundColor Cyan
$registerBody = @{
    email = $testEmail
    password = "password123"
    name = "Test Patient"
    role = "patient"
} | ConvertTo-Json

try {
    $register = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -ErrorAction Stop
    $token = $register.token
    $register | ConvertTo-Json
    Write-Host "✅ New user registered" -ForegroundColor Green
} catch {
    # If user exists, login instead
    Write-Host "User exists, trying login..." -ForegroundColor Yellow
    $loginBody = @{
        email = "patient@test.com"
        password = "password123"
    } | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $login.token
    $login | ConvertTo-Json
    Write-Host "✅ Logged in with existing user" -ForegroundColor Green
}

Write-Host "`n=== Testing AI Plan ===" -ForegroundColor Cyan
$aiBody = @{
    inputText = "Take Aspirin 100mg once daily in the morning"
} | ConvertTo-Json

$aiPlan = Invoke-RestMethod -Uri "$baseUrl/ai/plan" -Method Post -Body $aiBody -ContentType "application/json" -Headers @{"Authorization"="Bearer $token"}
$aiPlan | ConvertTo-Json
Write-Host "✅ AI Plan generated" -ForegroundColor Green

Write-Host "`n=== Testing Adherence Summary ===" -ForegroundColor Cyan
$adherence = Invoke-RestMethod -Uri "$baseUrl/adherence/summary" -Headers @{"Authorization"="Bearer $token"}
$adherence | ConvertTo-Json
Write-Host "✅ Adherence summary retrieved" -ForegroundColor Green

Write-Host "`n=== All Tests Complete ===" -ForegroundColor Green
