param([switch]$Download)
$ErrorActionPreference = 'Stop'
$reviewDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.native/preflop-source-review'))
New-Item -ItemType Directory -Force $reviewDirectory | Out-Null
$archivePath = Join-Path $reviewDirectory 'artgto-viewer.zip'
if ($Download) {
    Invoke-WebRequest -Uri 'https://dl.artgto.com/artgto-viewer.zip' -OutFile $archivePath
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne '8673a0ab0203b79f4363d58d84a7b6e24abf84c28a97d4e4e8e2f924566de94c') {
    throw 'Archive differs from the reviewed version. Review the new source before updating this fingerprint.'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @($archive.Entries | Where-Object { $_.FullName -match '^artgto-viewer/ranges/.+\.txt$' })
    if ($entries.Count -ne 2606) { throw 'Unexpected range-file count' }
    $rows = @($entries | ForEach-Object {
        if ($_.Length -gt 1048576) { throw 'Range entry exceeds import capacity' }
        $reader = [IO.StreamReader]::new($_.Open())
        try { @{ name = $_.FullName; text = $reader.ReadToEnd() } }
        finally { $reader.Dispose() }
    })
    $encoding = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText((Join-Path $reviewDirectory 'range-inputs.json'), (ConvertTo-Json -InputObject $rows -Depth 3 -Compress), $encoding)
    $utg = $rows | Where-Object { $_.name -eq 'artgto-viewer/ranges/utg/UTG_RFI.txt' }
    [IO.File]::WriteAllText((Join-Path $reviewDirectory 'UTG_RFI.txt'), $utg.text, $encoding)
    Write-Output "Prepared $($rows.Count) text ranges; no executable or viewer code was extracted or run."
}
finally { $archive.Dispose() }
