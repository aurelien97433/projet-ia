# Prépare .env.seed et régénère PROCESS_DOCUMENT_SECRET pour le préchargement distant (story 2.8).
# À lancer depuis la racine du projet : powershell -NoProfile -File scripts\setup-seed-env.ps1
# Aucune valeur n'est affichée. Procédure complète : docs/environnements.md.
$ErrorActionPreference = "Stop"
# Binaire local de la CLI, par son chemin complet : npx.cmd, lancé par cmd /s /c, calcule mal son
# propre dossier et cherche npm dans le projet. Remplaçable par les tests.
$CliCommand = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\node_modules\.bin\supabase.cmd"))

function Test-ProjectRoot {
  param([string]$Current, [string]$Expected)
  return (Test-Path (Join-Path $Current "supabase\config.toml")) -and
    ($Current.TrimEnd("\") -ieq $Expected.TrimEnd("\"))
}

function New-RandomSecret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

# Vrai pour une clé secrète Supabase, ou un jeton JWT dont le rôle est service_role. La clé
# publique et un jeton d'un autre rôle sont refusés.
function Test-ServiceRoleKey {
  param([string]$Key)
  if ($Key -cmatch '^sb_secret_[A-Za-z0-9_-]{20,}$') { return $true }
  if ($Key -notmatch '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { return $false }
  try {
    $payload = $Key.Split(".")[1].Replace("-", "+").Replace("_", "/")
    $payload = $payload.PadRight($payload.Length + ((4 - $payload.Length % 4) % 4), "=")
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
    return (ConvertFrom-Json $json).role -ceq "service_role"
  } catch {
    return $false
  }
}

# Valeurs déjà présentes dans .env.seed : les identifiants existants sont conservés.
function Read-SeedFile {
  param([string]$Path)
  $values = @{}
  if (Test-Path $Path) {
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
      if ($line -match '^([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2] }
    }
  }
  return $values
}

function New-SeedContent {
  param([hashtable]$Existing, [string]$Url, [string]$ServiceRoleKey, [string]$ProcessSecret)
  # Adresses fictives générées : aucun identifiant de démo n'existe dans un fichier suivi.
  $suffix = (New-RandomSecret).Substring(0, 8)
  $domain = "nexaworks.example"
  $accounts = [ordered]@{
    DEMO_ACCOUNT_A    = "demo.a.$suffix@$domain"
    DEMO_ACCOUNT_B    = "demo.b.$suffix@$domain"
    MEASURE_ACCOUNT_1 = "mesure.1.$suffix@$domain"
    MEASURE_ACCOUNT_2 = "mesure.2.$suffix@$domain"
    MEASURE_ACCOUNT_3 = "mesure.3.$suffix@$domain"
  }
  $lines = @("SEED_SUPABASE_URL=$Url", "SUPABASE_SERVICE_ROLE_KEY=$ServiceRoleKey", "PROCESS_DOCUMENT_SECRET=$ProcessSecret")
  foreach ($name in $accounts.Keys) {
    $email = if ($Existing["${name}_EMAIL"]) { $Existing["${name}_EMAIL"] } else { $accounts[$name] }
    $password = if ($Existing["${name}_PASSWORD"]) { $Existing["${name}_PASSWORD"] } else { New-RandomSecret }
    $lines += "${name}_EMAIL=$email"
    $lines += "${name}_PASSWORD=$password"
  }
  return ($lines -join "`n") + "`n"
}

# Lance la CLI dans un processus enfant : stdout et stderr sont capturés séparément, en UTF-8. Sous
# PowerShell 5.1, l'opérateur & avec $ErrorActionPreference = "Stop" transforme toute ligne de stderr
# en erreur bloquante, alors que la CLI y écrit des informations (« Target: … »). Seul le code de
# sortie décide de la réussite.
function Invoke-Cli {
  param([string[]]$Arguments)
  $quoted = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join " "
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $env:ComSpec
  $start.Arguments = '/d /s /c ""' + $CliCommand + '" ' + $quoted + '"'
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.StandardOutputEncoding = New-Object Text.UTF8Encoding $false
  $start.StandardErrorEncoding = New-Object Text.UTF8Encoding $false
  $process = [Diagnostics.Process]::Start($start)
  try {
    $process.StandardInput.Close()
    # Lectures simultanées : un tampon plein bloquerait sinon la CLI.
    $stderr = $process.StandardError.ReadToEndAsync()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $process.WaitForExit()
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout.Result; Stderr = $stderr.Result }
  } finally {
    $process.Dispose()
  }
}

# Vrai si la référence du projet a la forme attendue et si la CLI vise bien ce projet distant.
function Test-LinkedTarget {
  param([string]$Ref, [string]$ListOutput)
  if ($Ref -cnotmatch '^[a-z0-9]{20}$') { return $false }
  try {
    $start = $ListOutput.IndexOf("{")
    if ($start -lt 0) { return $false }
    $target = (ConvertFrom-Json $ListOutput.Substring($start)).target
    return ($target.kind -cne "local") -and ($target.project_ref -ceq $Ref)
  } catch {
    return $false
  }
}

# Vrai si le fichier existant vise déjà ce projet, ou s'il n'indique aucun projet.
function Test-SeedFileTarget {
  param([hashtable]$Existing, [string]$Url)
  return (-not $Existing["SEED_SUPABASE_URL"]) -or ($Existing["SEED_SUPABASE_URL"] -ceq $Url)
}

# Pose le secret dans Supabase, puis met .env.seed en place : en cas d'échec, .env.seed reste tel
# qu'il était et aucun fichier temporaire ne subsiste. La CLI ajoute aux secrets posés ceux de
# [edge_runtime.secrets] du config.toml voisin : elle travaille donc dans un dossier temporaire
# sans cette section, pour que EMBEDDINGS_FAKE n'aille jamais sur le projet distant.
function Publish-Secret {
  param([string]$Ref, [string]$Secret, [string]$SeedFile, [string]$Content)
  $utf8 = New-Object Text.UTF8Encoding $false
  $work = Join-Path $env:TEMP ("nexamind-seed-" + [Guid]::NewGuid().ToString("N"))
  $envFile = Join-Path $work "secret.env"
  $pendingSeed = "$SeedFile.tmp"
  try {
    New-Item -ItemType Directory -Force (Join-Path $work "supabase") | Out-Null
    [IO.File]::WriteAllText((Join-Path $work "supabase\config.toml"), "project_id = `"nexamind-seed`"`n", $utf8)
    [IO.File]::WriteAllText($envFile, "PROCESS_DOCUMENT_SECRET=$Secret`n", $utf8)
    [IO.File]::WriteAllText($pendingSeed, $Content, $utf8)
    $result = Invoke-Cli @("secrets", "set", "--env-file", $envFile, "--remote=$Ref", "--workdir", $work, "--yes")
    if ($result.ExitCode -ne 0) {
      Write-Host $result.Stderr
      return $false
    }
    Move-Item -Force $pendingSeed $SeedFile
    return $true
  } finally {
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
    if (Test-Path $pendingSeed) { Remove-Item $pendingSeed -Force }
  }
}

function Invoke-Setup {
  [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
  $root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  if (-not (Test-ProjectRoot -Current (Get-Location).Path -Expected $root)) {
    Write-Error "Lancez ce script depuis la racine du projet."
    exit 1
  }
  $refFile = Join-Path $root "supabase\.temp\project-ref"
  if (-not (Test-Path $refFile)) {
    Write-Error "Aucun projet distant lié : lancez d'abord npx supabase link."
    exit 1
  }
  $ref = (Get-Content $refFile -Raw).Trim()
  $list = Invoke-Cli @("secrets", "list", "--remote=$ref", "--output-format", "json")
  if ($list.ExitCode -ne 0) {
    Write-Host $list.Stderr
    Write-Error "La lecture du projet lié a échoué. Rien n'a été modifié."
    exit 1
  }
  if (-not (Test-LinkedTarget -Ref $ref -ListOutput $list.Stdout)) {
    Write-Error "La CLI ne vise pas le projet lié. Rien n'a été modifié."
    exit 1
  }
  $seedFile = Join-Path $root ".env.seed"
  $existing = Read-SeedFile $seedFile
  $url = "https://$ref.supabase.co"
  if (-not (Test-SeedFileTarget -Existing $existing -Url $url)) {
    Write-Error ".env.seed vise un autre projet. Rien n'a été modifié."
    exit 1
  }
  Write-Host "Projet distant visé : $ref"
  Write-Host "Secret qui sera remplacé : PROCESS_DOCUMENT_SECRET (un seul)."
  if ((Read-Host "Tapez la référence du projet pour confirmer") -cne $ref) {
    Write-Error "Référence différente. Rien n'a été modifié."
    exit 1
  }

  $secure = Read-Host "Clé service_role du projet (saisie masquée)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  if (-not (Test-ServiceRoleKey -Key $key)) {
    Remove-Variable key, secure
    Write-Error "Cette clé n'a pas le format d'une clé service_role. Rien n'a été modifié."
    exit 1
  }

  $secret = New-RandomSecret
  $content = New-SeedContent -Existing $existing -Url $url -ServiceRoleKey $key -ProcessSecret $secret
  if (-not (Publish-Secret -Ref $ref -Secret $secret -SeedFile $seedFile -Content $content)) {
    Write-Error "La pose du secret dans Supabase a échoué. Rien n'a été modifié."
    exit 1
  }
  Write-Host "Secret posé dans Supabase, .env.seed écrit."

  # finally : même après Ctrl+C, le secret ne reste pas dans le presse-papiers.
  try {
    Set-Clipboard -Value $secret
    Write-Host "Le secret est dans le presse-papiers. Collez-le dans Vercel :"
    Write-Host "  Settings > Environment Variables > PROCESS_DOCUMENT_SECRET,"
    Write-Host "  Production et Preview, option Sensitive, puis enregistrez."
    do {
      $answer = Read-Host "Tapez OK quand c'est enregistré dans Vercel"
    } while ($answer -cne "OK")
  } finally {
    Set-Clipboard -Value " "
    Remove-Variable secret, key, secure, content -ErrorAction SilentlyContinue
  }
  Write-Host "Presse-papiers effacé. Si l'historique Win + V est actif, supprimez aussi l'entrée."
  Write-Host "Etape suivante : redéployez sur Vercel, puis suivez docs/environnements.md."
}

# Chargé par dot-sourcing, le script n'expose que ses fonctions (tests).
if ($MyInvocation.InvocationName -ne ".") { Invoke-Setup }
